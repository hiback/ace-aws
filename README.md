# ace-aws

AWS certification practice — a mobile-first, zero-backend quiz app for AWS DVA-C02 (Developer Associate).

Built with Next.js 15+ (App Router), TypeScript, Tailwind v4, Zustand, and TanStack Query. All user progress lives in `localStorage`. Designed for self-hosting via Docker.

## Status

MVP — DVA-C02 only. Mock exam, dashboard, and community comments are out of scope (planned for v2).

## Local Development

### Prerequisites

- Node.js 24+
- pnpm 9+
- A copy of the source question bank at `refs/questions.json` (gitignored — must be supplied externally; ask the project owner)

### First-time setup

```bash
pnpm install
pnpm build:data        # ETL: refs/questions.json → src/data/dva-c02.json
pnpm dev               # http://localhost:3000
```

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
# requires refs/questions.json to be present at build time
docker compose up -d --build
```

The container exposes HTTP on port 3000. TLS / reverse proxy are intentionally NOT in this repo — front it with your own ingress (Caddy, Traefik, nginx, etc.).

## Architecture (very short)

- `src/app/` — Next.js App Router; route groups `(tabbed)` (Home, List, Settings) and `(immersive)` (Cert select, Practice)
- `src/data/` — Question types + lazy-imported question bank chunks (gitignored)
- `src/repositories/` — `ProgressRepository` interface + `LocalProgressRepository` (localStorage); future `ServerProgressRepository` swaps the implementation
- `src/stores/prefs-store.ts` — Zustand store for theme / locale / currentCert (persisted)
- `src/hooks/` — TanStack Query bridges (`useQuestion`, `useAnswer`, `useSaveAnswer`, ...) + `useT` i18n
- `src/styles/globals.css` — Tailwind v4 + CSS variables + dark mode via `[data-theme=dark]`

## License

MIT — see [LICENSE](./LICENSE).
