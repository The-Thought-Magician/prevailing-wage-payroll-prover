# PrevailingWagePayrollProver

PrevailingWagePayrollProver is a vertical compliance desk that proves every worker on a public-works project was paid the correct Davis-Bacon prevailing wage and fringe benefit for their classification, every day, before the weekly WH-347 certified payroll is filed.

It ingests wage determinations, worker classification ledgers, and daily payroll lines, then runs deterministic rule checks (rate floor, fringe sufficiency, apprentice ratio, overtime, classification validity) and produces a signed, audit-ready certified payroll packet. It is built for the payroll or compliance administrator who personally owns the weekly certified-payroll filing at a prevailing-wage general contractor or subcontractor.

See [`docs/idea.md`](docs/idea.md) for the full product specification and feature breakdown.

## Stack

- **Backend:** Hono on Node (TypeScript, ESM), run with `node --import tsx/esm`. Drizzle ORM over Neon Postgres (`@neondatabase/serverless`). Endpoints mounted under `/api/v1`, with a root `/health` check.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4. Auth via `@neondatabase/auth` (Neon Auth). The browser calls a same-origin `/api/proxy/...` route that resolves the session server-side and forwards an `X-User-Id` header the backend trusts.
- **Database:** Neon Postgres. Tables are provisioned out-of-band (drizzle schema push / Neon console); the backend seeds reference data idempotently on boot but does not create its own tables.
- **Deploy:** backend on Render (`render.yaml`), frontend on Vercel. `docker-compose.yml` brings both up together for local container runs.

## Local Development

Prerequisites: Node 22+, pnpm, and a Neon Postgres `DATABASE_URL`.

### Backend

```bash
cd backend
pnpm install
pnpm dev
```

The backend listens on port 3001 by default. Create `backend/.env`:

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
ADMIN_USER_IDS=
```

### Frontend

```bash
cd web
pnpm install
pnpm dev
```

The frontend runs on port 3000. Create `web/.env.local`:

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Run both with Docker Compose

```bash
docker compose up --build
```

This starts the backend on `http://localhost:3001` and the web app on `http://localhost:3000`.

## Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | yes | HTTP port (3001 local, 10000 on Render) |
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `FRONTEND_URL` | yes | Allowed CORS origin for the web app |
| `ADMIN_USER_IDS` | no | Comma-separated user IDs granted admin access |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `NEON_AUTH_BASE_URL` | yes | Neon Auth base URL (server-only) |
| `NEON_AUTH_COOKIE_SECRET` | yes | Cookie signing secret (server-only) |
| `NEXT_PUBLIC_API_URL` | yes | Backend base URL, baked into the bundle at build time |

## Pricing

All features are free for signed-in users. There is no paid tier or gating, sign in and every capability, from the wage-determination register through WH-347 generation and the deterministic rule engine, is available.
