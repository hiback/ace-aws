# ace-aws

AWS certification practice — a mobile-first quiz app for AWS CLF-C02 and DVA-C02.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand, TanStack Query, NextAuth, Drizzle, and PostgreSQL. Anonymous progress stays in `localStorage`; signed-in progress syncs through the backend. Designed for self-hosting via Docker.

## Status

MVP — CLF-C02 and DVA-C02 question banks. Mock exam, dashboard, and community comments are out of scope (planned for v2).

## Local Development

### Prerequisites

- Node.js 24+
- pnpm 9+
- Optional: source question banks under `refs/` if you need to regenerate committed `src/data/*.json` banks

### First-time setup

```bash
pnpm install
pnpm dev               # http://localhost:3000
```

Committed files under `src/data/` are enough for local development, CI, and Docker builds. Run `pnpm build:data` only when a raw question bank changes.

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

Create a GitHub OAuth App before starting the stack:

- Homepage URL: the same value as `AUTH_URL`, for example `https://ace.example.com`
- Authorization callback URL: `${AUTH_URL}/api/auth/callback/github`, for example `https://ace.example.com/api/auth/callback/github`

Prepare `.env` from `.env.example` and fill these values:

- `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` from the GitHub OAuth App
- `AUTH_SECRET`, generated with `openssl rand -base64 32`
- `AUTH_URL`, the external URL users open in the browser
- `POSTGRES_DB`, `POSTGRES_USER`, and a strong `POSTGRES_PASSWORD`

`docker-compose.yml` builds `DATABASE_URL` from the Postgres values. Keep `POSTGRES_PASSWORD` to URL-safe characters unless you edit the connection string yourself.

```bash
docker compose pull
docker compose up -d
```

`docker-compose.yml` pulls `ghcr.io/hiback/ace-aws:latest`; it does not build locally. The stack starts the app and an internal PostgreSQL service with a persistent Docker volume. PostgreSQL is not exposed on the host. The app waits for PostgreSQL, runs pending Drizzle migrations on every container start, and exits if migrations fail.

The container exposes HTTP on port 3000. TLS / reverse proxy are intentionally NOT in this repo — front it with your own ingress (Caddy, Traefik, nginx, etc.).

## Architecture (very short)

- `src/app/` — Next.js App Router; route groups `(tabbed)` (Home, List, Settings) and `(immersive)` (Cert select, Practice)
- `src/data/` — Question types + lazy-imported committed question banks
- `src/repositories/` — `ProgressRepository` interface with localStorage and account-backed implementations
- `src/stores/prefs-store.ts` — Zustand store for theme / locale / currentCert (persisted)
- `src/hooks/` — TanStack Query bridges (`useQuestion`, `useAnswer`, `useSaveAnswer`, ...) + `useT` i18n
- `src/app/globals.css` — Tailwind v4 + CSS variables + dark mode via `[data-theme=dark]`

## License

MIT — see [LICENSE](./LICENSE).
