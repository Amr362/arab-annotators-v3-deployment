# ✅ Phase 1 Complete — Database Schema Upgrade

**Estimated effort:** ~2 days (Week 1)

## What was done

### New migration file
`drizzle/0006_v4_state_machine.sql` — run this on your live database.

### Updated `drizzle/schema.ts`
All Drizzle ORM types updated to reflect the new schema.

---

## Changes summary

### Enum changes
| Enum | Added values |
|------|-------------|
| `role` | `manager` |
| `task_status` | `CREATED`, `ASSIGNED`, `IN_PROGRESS`, `SUBMITTED`, `IN_QA`, `APPROVED`, `REJECTED`, `EXPIRED` |

### New columns on existing tables

**`users`**
- `skillLevel` INTEGER DEFAULT 1 — controls which tasks the worker can receive
- `skillDomains` TEXT[] — domain tags (e.g. finance, medical)
- `maxActiveTasks` INTEGER DEFAULT 10 — max concurrent tasks
- `isAvailable` BOOLEAN DEFAULT TRUE — worker availability toggle
- `isSuspended` BOOLEAN DEFAULT FALSE — auto-suspension by system
- `suspendedAt` TIMESTAMPTZ
- `suspendReason` TEXT

**`tasks`**
- `difficulty` INTEGER DEFAULT 1 — task difficulty tier (1–5)
- `isHoneyPot` BOOLEAN DEFAULT FALSE — marks quality trap tasks
- `honeyPotAnswer` JSONB — the correct answer for honey pot checking
- `batchId` INTEGER — links to batches table
- `expiresAt` TIMESTAMPTZ — auto-expire for abandoned tasks
- `mediaUrl` TEXT — optional media attachment
- `requiredSkillLevel` INTEGER DEFAULT 1

**`annotations`**
- `isHoneyPotCheck` BOOLEAN DEFAULT FALSE
- `honeyPotPassed` BOOLEAN
- `submittedAt` TIMESTAMPTZ

### New tables
| Table | Purpose |
|-------|---------|
| `task_transitions` | Audit log for every task state change |
| `worker_metrics` | Per-user/per-project quality stats (recomputed by StatsWorker every 60s) |
| `batches` | Group tasks with configurable honey pot & QA rates |
| `iaa_scores` | Inter-annotator agreement (Cohen's κ, Fleiss' κ) |
| `project_assignments` | Manager-controlled team assignments per project |

## How to deploy
```bash
# On your Railway/production Postgres:
psql $DATABASE_URL < drizzle/0006_v4_state_machine.sql
```

The migration is **non-breaking** — all existing v3 rows remain valid.

## Next: Phase 2
> State Machine class + BullMQ worker infrastructure
