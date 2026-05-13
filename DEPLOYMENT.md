# 🚀 AnnotateOS v4 — Deployment Guide

## Quick start (Railway)

1. Fork the repo and push to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Add a **PostgreSQL** plugin to the project
4. Set environment variables (see below)
5. Railway auto-deploys on every push to `main`

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (e.g. Supabase Pooler port 6543) |
| `SESSION_SECRET` | ✅ | Random string ≥ 32 chars for session signing |
| `PORT` | Auto | Set by Railway — defaults to 5000 |
| `NODE_ENV` | Auto | Set to `production` in railway.toml |
| `GEMINI_API_KEY` | Optional | Enables AI pre-annotation & QA review |
| `AWS_*` | Optional | Enables media file uploads to S3 |
| `LABEL_STUDIO_*` | Optional | Enables Label Studio sync |
| `REDIS_URL` | Optional | Upgrades workers from setInterval → BullMQ |

**Generate SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Database setup

Migrations run automatically on start via `pnpm db:push`.

To run the v4 migration manually on an existing v3 database:
```bash
psql $DATABASE_URL < drizzle/0006_v4_state_machine.sql
```

The migration is **non-breaking** — all v3 data is preserved.

---

## Running locally

```bash
# 1. Install
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL and SESSION_SECRET

# 3. Push schema
pnpm db:push

# 4. Start dev server (frontend + backend)
pnpm dev
```

---

## Running tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage report
pnpm test:coverage

# Interactive UI
pnpm test:ui
```

**Coverage thresholds** (enforced in CI):
- Lines: 70%
- Functions: 70%
- Branches: 60%
- Statements: 70%

---

## Docker

```bash
# Build
docker build -t annotate-os-v4 .

# Run
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://... \
  -e SESSION_SECRET=... \
  annotate-os-v4
```

---

## CI/CD pipeline

```
push to main/PR
    │
    ├─► lint + type-check
    │
    ├─► unit tests (vitest)
    │       server/workers/__tests__/
    │       ├── stateMachine.test.ts
    │       ├── honeypotChecker.test.ts
    │       ├── iaaWorker.test.ts
    │       ├── skipRateLimiter.test.ts
    │       ├── distributionWorker.test.ts
    │       └── statsWorker.test.ts
    │
    ├─► build (vite + tsc)
    │
    └─► (main only) deploy → Railway
```

PR checks additionally run:
- Migration safety (no destructive SQL)
- Bundle size report
- Coverage summary comment

---

## Production architecture

```
┌─────────────────────────────────────────────────────────┐
│  Railway                                                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Node.js server (Express + tRPC)                 │   │
│  │                                                  │   │
│  │  Background workers (setInterval)                │   │
│  │  ├── StatsWorker    (every 60s)                  │   │
│  │  ├── IAAWorker      (every 5min)                 │   │
│  │  └── ExpiryWorker   (every 60s)                  │   │
│  └────────────────────────┬─────────────────────────┘   │
│                           │                              │
│  ┌────────────────────────▼─────────────────────────┐   │
│  │  PostgreSQL (Railway plugin)                     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

Optional upgrade path:
  Add Redis → replace setInterval workers with BullMQ
  (REDIS_URL env var activates this automatically)
```

---

## Health check

```
GET /api/health
→ { status: "ok", version: "4.0.0", uptime: 142, timestamp: "..." }
```

Used by Railway and Docker healthcheck.

---

## Role hierarchy

| Role | Access |
|------|--------|
| `admin` | Everything |
| `manager` | Projects, team, QA queue, metrics, IAA |
| `qa` | QA queue, annotation review |
| `tasker` | Annotation workspace |
| `user` | No access (pending role assignment) |

---

## Upgrading from v3

1. Deploy new code (app stays running — v3 endpoints still work)
2. Run `0006_v4_state_machine.sql` migration
3. Backfill task statuses: `UPDATE tasks SET status = 'CREATED' WHERE status = 'pending'`
4. (Optional) Promote trusted users to `manager` role in admin panel
5. StatsWorker will auto-populate `worker_metrics` within 60 seconds
6. IAAWorker will auto-populate `iaa_scores` within 5 minutes

No downtime required.
