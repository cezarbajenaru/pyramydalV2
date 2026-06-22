# Pyramydal UI (React + Vite)

Project-owned UI shell replacing previous Appsmith integration.

**Setup:** see [docs/GUIDE.md](../docs/GUIDE.md#local-development).

## Implemented in this phase
- Appsmith-like workspace layout:
  - left navigation
  - top toolbar
  - central table workspace
  - right properties/actions panel
- First functional vertical slice:
  - load paginated `main_rows`
  - select row
  - edit `buc`
  - save via API abstraction
  - show recalculation status

## Runtime modes
Runtime mode comes from environment variables:
- `aws`
- `localstack`
- `mock` (default fallback)

Files:
- `.env.example` for AWS-like endpoint profile
- `.env.localstack` for localstack endpoint profile

## Commands
```bash
npm install
npm run dev
npm run build
npm run lint
```

## Localstack-oriented run (profile only)
```bash
cp .env.localstack .env.local
npm run dev
```

Backend emulation stack is scaffolded in root `docker-compose.local.yml` and will be wired end-to-end in later phase.
