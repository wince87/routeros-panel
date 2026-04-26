# .mikrotik/panel

A local web panel for **MikroTik RouterOS 7.x** — runs as a tiny Node CLI, talks to the router via REST, never leaves your LAN.

[![npm](https://img.shields.io/npm/v/mikrotik-panel?color=22c55e)](https://www.npmjs.com/package/mikrotik-panel) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org) [![CI](https://github.com/wince87/mikrotik-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/wince87/mikrotik-panel/actions)

```bash
npx mikrotik-panel
```

---

## Contents

[Features](#features) · [Quick start](#quick-start) · [Why this over WebFig](#why-this-over-webfig) · [Install](#install) · [CLI](#cli) · [Security](#security) · [Router setup](#router-setup) · [Development](#development) · [Troubleshooting](#troubleshooting) · [License](#license)

---

## Features

| Page | What you can do |
| --- | --- |
| **Dashboard** | Live topology (WAN → core → bridge → LAN), CPU / RAM, uptime, packages, DHCP lease count, NAT / filter / route counters. |
| **ISP** | Single-WAN provider switch by `default-route-distance`. Dual-WAN PCC load balancer with custom split (10 % steps) and exclusions list. Per-ISP throughput. |
| **Setup** | 5-step wizard: detect ports, assign WAN / LAN / unused, configure bridge + DHCP, NAT, optional PCC. Apply log of every API call before commit. |
| **WireGuard** | Server + client setup with **in-browser** key generation (`tweetnacl`). Auto firewall rules. QR codes per peer. |
| **Routes** | Draggable graph of routing tables, distance / gateway / target editor. |
| **Firewall** | Filter / NAT / mangle / raw / address-list, per-chain stats, topology view, inline add / edit / delete. |
| **Clients** | DHCP leases + ARP merged into one table. MAC blocking via `blocked-clients` address list. |
| **Hotspot** | Servers, profiles, users, IP bindings, walled garden, active sessions. |
| **Backup** | Create / restore / delete `.backup` files via `/system/backup`. |

---

## Quick start

> [!TIP]
> Make sure the REST API is enabled on your router first:
> ```routeros
> /ip service enable www-ssl   # HTTPS (recommended)
> /ip service enable www       # HTTP fallback
> ```

```bash
npx mikrotik-panel
```

Open <http://localhost:3000>, fill in IP / username / password, you're in.

---

## Why this over WebFig

WebFig and Winbox give you the full RouterOS surface — every option, every menu. That's their strength and the reason a routine task takes 40 clicks across six tabs. This panel covers the handful of things you actually do during a setup or weekly maintenance, in the smallest sensible number of clicks.

- **Dual-WAN PCC** — one slider (10 % steps) and an exclusions list. The 10 mangle rules, two routing tables and the marks are written for you, with readable comments you can audit and roll back.
- **WireGuard for a phone** — keys generated in the browser, QR code rendered in place, `input` / `forward` / NAT rules added in one pass.
- **Inline edits** — click the provider name, type, Enter. No dialogs.
- **Topology at a glance** — Dashboard draws WAN → core → bridge → LAN with real interface names, IPs, DHCP statuses.
- **Clients in one table** — DHCP leases + ARP merged. Static devices that never asked for a lease still show up. MAC blocking is one click.
- **Apply preview** — Setup wizard prints every API call before committing.
- **One command, no cloud** — `npx mikrotik-panel`. Nothing leaves your LAN, no account, no telemetry.

UI choices that show up in daily use:

- Dark theme, JetBrains Mono for IPs / MACs / hex — values stay readable.
- Polling without flicker; rate calculations measure their own elapsed time, so background-tab throttling does not produce fake spikes.
- Aggregated errors instead of swallowed ones — partial PCC deactivation tells you which exact rule failed.
- Keyboard-friendly forms (Enter, Escape, comma adds an exclusion tag).

---

## Install

```bash
# one-shot
npx mikrotik-panel

# global
npm install -g mikrotik-panel
mikrotik-panel --port 3001

# project dev-dependency
pnpm add -D mikrotik-panel
pnpm exec mikrotik-panel
```

---

## CLI

```text
mikrotik-panel [--port <port>] [--host <host>]

  -p, --port <port>   Port to listen on               (default: 3000)
  -H, --host <host>   Host to bind                    (default: 127.0.0.1)
  -v, --version       Print version and exit
  -h, --help          Print this help and exit
```

```bash
# default — loopback only, port 3000
mikrotik-panel

# expose to the LAN
mikrotik-panel --host 0.0.0.0 --port 8080
```

Exit codes: `0` clean, `1` bad arguments / missing `dist/` / invalid port.

---

## Security

> [!IMPORTANT]
> The panel never sends credentials to a third party. Everything stays between **browser → CLI → router**.

| | |
| --- | --- |
| **Bind** | `127.0.0.1` only by default — no LAN exposure unless you pass `--host`. |
| **Proxy target** | Refuses anything outside `10/8`, `172.16/12`, `192.168/16`, `127/8` (returns `403`). |
| **Credentials** | Only the Basic-auth token (`btoa("user:pass")`) is stored in `sessionStorage`. The plain password is never persisted. Closing the tab clears it. |
| **Transport** | HTTPS is the login default. HTTP shows a visible warning. |
| **TLS verification** | Disabled for the router connection (RouterOS ships with self-signed certs). Acceptable on a private LAN — be aware. |
| **External calls** | None at runtime. Not even to npm. |

---

## Router setup

```routeros
# HTTPS (recommended)
/certificate add name=panel common-name=router.lan
/certificate sign panel
/ip service set www-ssl certificate=panel
/ip service enable www-ssl

# OR HTTP
/ip service enable www
```

Minimal user policy:

```routeros
/user group add name=panel \
  policy=read,write,policy,api,rest-api,ftp,sniff,sensitive
/user add name=panel password=<strong-password> group=panel
```

Drop `policy` and `sensitive` for read-only access.

---

## Requirements

- **Node.js 20.19** or later (Vite 7).
- **MikroTik RouterOS 7.x** with the REST API enabled.
- A user with the policy bits for the resources you plan to manage.

---

## Development

```bash
pnpm install
pnpm dev          # Vite dev server (http://localhost:3000)
pnpm test         # Vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # production bundle → dist/
pnpm start        # run the CLI against the built dist/
```

`pnpm publish` runs `lint && typecheck && test && build` automatically through `prepublishOnly`.

### Project layout

```
src/
  api.ts                  Typed REST client + 401 handler
  contexts/               Auth, RouterData (TypeScript)
  hooks/                  useMessage, usePolling, useCrud
  styles/                 theme tokens, shared style helpers
  types/router.ts         RouterOS entity types
  utils/                  format, net, isp, graph, pcc
  components/             Small shared UI
  pages/                  One file per route
bin/cli.js                Production CLI: static server + router proxy
.github/workflows/        CI (Node 20/22) + Publish (on v* tags)
```

---

## Troubleshooting

<details>
<summary><strong><code>Cannot connect to router</code></strong></summary>

The CLI proxy could not reach the router. Check `ping <router-ip>` and that the right protocol is selected — `www-ssl` is **not** enabled by default; if your router has only `www` on, switch the form to HTTP.
</details>

<details>
<summary><strong><code>Connection failed (502)</code></strong> — Router unreachable on HTTPS</summary>

Your router refuses TLS on port 443. Either enable `www-ssl` (see [Router setup](#router-setup)) or switch the login form to HTTP.
</details>

<details>
<summary><strong><code>Invalid credentials</code></strong></summary>

The password is wrong, or the user lacks `rest-api` policy. Verify with curl:

```bash
curl -u admin:password http://192.168.88.1/rest/system/identity
```
</details>

<details>
<summary><strong><code>Target must be a private network host</code></strong> (403 from proxy)</summary>

You typed a public IP in the login form. The proxy whitelist is RFC1918 + loopback only. Run the panel from a host inside the same private network as the router.
</details>

---

## Roadmap

- [ ] Decompose `HotspotPage` and `FirewallPage` into per-tab components.
- [ ] Migrate remaining pages from `.jsx` to `.tsx`.
- [ ] Offline (no Google Fonts) mode.
- [ ] Per-router profile / bookmark management.
- [ ] i18n (currently English-only).

---

## Contributing

Issues and PRs are welcome. Before opening a PR:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

For UI changes, attach a before / after screenshot. For RouterOS-side changes (firewall, mangle, NAT) include the exported config snippet so a reviewer can replay it on a test router.

This project is not affiliated with MikroTik. Use at your own risk; always take a backup before modifying firewall, NAT or routing rules.

---

## License

[MIT](./LICENSE)
