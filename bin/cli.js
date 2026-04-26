#!/usr/bin/env node
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const distDir = join(pkgRoot, 'dist');

const args = process.argv.slice(2);

function parseArgs(argv) {
  const opts = { port: 3000, host: '127.0.0.1', help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') opts.port = parseInt(argv[++i], 10);
    else if (a === '--host' || a === '-H') opts.host = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--version' || a === '-v') opts.version = true;
  }
  return opts;
}

const opts = parseArgs(args);

if (opts.help) {
  process.stdout.write(`mikrotik-panel — Local web panel for MikroTik RouterOS

Usage:
  mikrotik-panel [--port <port>] [--host <host>]

Options:
  -p, --port <port>   Port to listen on (default: 3000)
  -H, --host <host>   Host to bind (default: 127.0.0.1)
  -v, --version       Print version
  -h, --help          Show this help

Open http://localhost:<port> in a browser. The panel will prompt for your
router IP and credentials. All traffic stays between your browser, this CLI,
and the router on your private network.

Security:
  - The CLI binds to 127.0.0.1 by default. Do not bind to 0.0.0.0 unless
    you understand the implications — credentials would be reachable from
    any host that can reach the bind address.
  - Only private-network targets are accepted (10/8, 172.16/12, 192.168/16,
    127/8). Public IPs are refused.
`);
  process.exit(0);
}

if (opts.version) {
  const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'));
  process.stdout.write(pkg.version + '\n');
  process.exit(0);
}

if (!Number.isFinite(opts.port) || opts.port < 1 || opts.port > 65535) {
  process.stderr.write(`Invalid port: ${opts.port}\n`);
  process.exit(1);
}

try {
  const s = await stat(distDir);
  if (!s.isDirectory()) throw new Error('not a directory');
} catch {
  process.stderr.write(`dist/ not found at ${distDir}. Did you run "vite build"?\n`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isPrivateHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '::1') return true;
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const o = parts.map(Number);
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  if (o[0] === 127) return true;
  if (o[0] === 10) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  return false;
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = join(distDir, urlPath);
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    try {
      const fallback = await readFile(join(distDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(fallback);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
}

function proxyToRouter(req, res) {
  const target = req.headers['x-router-target'] || '';
  let url;
  try {
    url = new URL(target);
  } catch {
    res.writeHead(400);
    res.end('Invalid target URL');
    return;
  }
  if (!isPrivateHost(url.hostname)) {
    res.writeHead(403);
    res.end('Target must be a private network host');
    return;
  }
  const path = '/rest' + (req.url || '/').replace(/^\/api/, '');
  const headers = { ...req.headers, host: url.host };
  delete headers['x-router-target'];
  delete headers['origin'];
  delete headers['referer'];

  const reqFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxyReq = reqFn(
    {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path,
      method: req.method,
      headers,
      rejectUnauthorized: false,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end('Proxy error');
  });
  req.pipe(proxyReq);
}

const server = createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if ((req.url || '').startsWith('/api')) {
    proxyToRouter(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(opts.port, opts.host, () => {
  process.stdout.write(`mikrotik-panel listening on http://${opts.host}:${opts.port}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n');
});

const shutdown = (signal) => {
  process.stdout.write(`\nReceived ${signal}, shutting down...\n`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
