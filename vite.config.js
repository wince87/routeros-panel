import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function isPrivateHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '::1') return true;
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const o = parts.map(Number);
  if (o.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  if (o[0] === 127) return true;
  if (o[0] === 10) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  return false;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'router-proxy',
      configureServer(server) {
        server.middlewares.use('/api', async (req, res) => {
          const target = req.headers['x-router-target'] || 'http://192.168.88.1';
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
          const path = '/rest' + req.url;
          const headers = { ...req.headers, host: url.host };
          delete headers['x-router-target'];
          delete headers['origin'];
          delete headers['referer'];

          const http = await import(url.protocol === 'https:' ? 'https' : 'http');
          const proxyReq = http.request(
            {
              hostname: url.hostname,
              port: url.port || (url.protocol === 'https:' ? 443 : 80),
              path,
              method: req.method,
              headers,
              rejectUnauthorized: false,
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            }
          );
          proxyReq.on('error', () => {
            res.writeHead(502);
            res.end('Proxy error');
          });
          req.pipe(proxyReq);
        });
      },
    },
  ],
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
          crypto: ['tweetnacl', 'qrcode.react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
