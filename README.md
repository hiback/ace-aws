# ace-aws

AWS certification practice — a mobile-first, zero-backend quiz app for AWS DVA-C02 (Developer Associate).

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand, and TanStack Query. All user progress lives in `localStorage`. Designed for self-hosting via Docker.

## Status

MVP — DVA-C02 only. Mock exam, dashboard, and community comments are out of scope (planned for v2).

## Local Development

### Prerequisites

- Node.js 24+
- pnpm 9+
- Optional: a copy of the source question bank at `refs/dva-c02.json` if you need to regenerate `src/data/dva-c02.json`

### First-time setup

```bash
pnpm install
pnpm dev               # http://localhost:3000
```

`src/data/dva-c02.json` is committed, so local development, CI, and Docker builds do not need `refs/dva-c02.json`. Run `pnpm build:data` only when the raw question bank changes.

### Tests

```bash
pnpm test              # watch mode
pnpm test:ci           # one-shot
```

### Lint / format

```bash
pnpm lint
pnpm format
```

## Production deployment (Docker)

```bash
docker compose pull
docker compose up -d
```

`docker-compose.yml` pulls `ghcr.io/hiback/ace-aws:latest`; it does not build locally. The image relies on the committed `src/data/dva-c02.json`. The container exposes HTTP on port 3000. TLS / reverse proxy are intentionally NOT in this repo — front it with your own ingress (Caddy, Traefik, nginx, etc.).

## Architecture (very short)

- `src/app/` — Next.js App Router; route groups `(tabbed)` (Home, List, Settings) and `(immersive)` (Cert select, Practice)
- `src/data/` — Question types + lazy-imported committed DVA-C02 question bank
- `src/repositories/` — `ProgressRepository` interface + `LocalProgressRepository` (localStorage); future `ServerProgressRepository` swaps the implementation
- `src/stores/prefs-store.ts` — Zustand store for theme / locale / currentCert (persisted)
- `src/hooks/` — TanStack Query bridges (`useQuestion`, `useAnswer`, `useSaveAnswer`, ...) + `useT` i18n
- `src/app/globals.css` — Tailwind v4 + CSS variables + dark mode via `[data-theme=dark]`

## License

MIT — see [LICENSE](./LICENSE).
