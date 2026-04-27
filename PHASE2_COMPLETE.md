# ✅ Phase 2 Complete — Backend Core: State Machine + Workers

**Estimated effort:** ~5 days (Week 1–2)

## New files created

```
server/workers/
├── all.ts                  ← startup entry: startAllWorkers()
├── stateMachine.ts         ← TaskStateMachine (core)
├── distributionWorker.ts   ← replaces inline getNextTask
├── qaSamplingWorker.ts     ← honey pot + QA sampling
├── honeypotChecker.ts      ← label comparison logic
├── statsWorker.ts          ← worker metrics + auto-promotion
├── iaaWorker.ts            ← Cohen's κ + Fleiss' κ
└── expiryWorker.ts         ← auto-expire abandoned tasks
```

## Files modified

| File | Change |
|------|--------|
| `server/_core/index.ts` | Added `startAllWorkers()` call at startup |
| `server/routers.ts` | Replaced inline `getNextTask` with `assignNextTask()`; updated `submitAnnotation` to use state machine; added 7 new routers |
| `drizzle/schema.ts` | (Phase 1) |

---

## TaskStateMachine — valid transitions

```
CREATED → ASSIGNED → IN_PROGRESS → SUBMITTED → IN_QA → APPROVED
                                                      ↘ REJECTED → ASSIGNED
ASSIGNED | IN_PROGRESS → EXPIRED → CREATED
```

Every transition is:
- **Atomic** — uses DB-level update with WHERE check
- **Audited** — writes a row to `task_transitions`
- **Validated** — throws 400 on invalid transitions

---

## New tRPC endpoints (v4)

| Router | Procedure | Access |
|--------|-----------|--------|
| `tasker` | `getNextTask` | tasker/admin — now uses DistributionWorker |
| `tasker` | `startTask` | tasker/admin — transitions to IN_PROGRESS |
| `tasker` | `submitAnnotation` | tasker/admin — state machine + QA trigger |
| `workerMetrics` | `getForProject` | admin/manager |
| `workerMetrics` | `getForWorker` | any user (own metrics) |
| `workerMetrics` | `triggerRecompute` | admin |
| `iaa` | `getForProject` | admin/manager |
| `iaa` | `triggerCompute` | admin/manager |
| `honeyPot` | `setTask` | admin/manager |
| `batches` | `create` | admin/manager |
| `batches` | `getForProject` | admin/manager |
| `projectAssignments` | `assign` | admin/manager |
| `projectAssignments` | `getForProject` | admin/manager |
| `projectAssignments` | `remove` | admin/manager |
| `qaActions` | `approve` | qa/admin/manager |
| `qaActions` | `reject` | qa/admin/manager |

---

## Worker schedule

| Worker | Interval | What it does |
|--------|----------|--------------|
| StatsWorker | every 60s | Recomputes worker_metrics; auto-promotes skill; auto-suspends if HP < 50% |
| IAAWorker | every 5min | Computes Cohen's κ (pairwise) and Fleiss' κ (project-level) |
| ExpiryWorker | every 60s | Expires ASSIGNED/IN_PROGRESS tasks past their expiresAt |

---

## DistributionWorker — smart assignment logic

1. Check worker is available & not suspended
2. Check active task count < maxActiveTasks
3. Filter out tasks already submitted by this worker
4. Match `task.requiredSkillLevel ≤ worker.skillLevel`
5. Order by RANDOM() to prevent hotspots
6. Set 24h expiry on assigned task
7. Transition: CREATED → ASSIGNED

---

## Skill auto-promotion thresholds

| Level | Min annotations | Min QA pass rate | Min HP accuracy |
|-------|----------------|-----------------|----------------|
| 2 | 50 | 85% | 90% |
| 3 | 200 | 90% | 95% |
| 4 | 500 | 93% | 97% |
| 5 | 1000 | 95% | 99% |

Auto-suspension triggers when HP accuracy < 50% after ≥ 5 honey pot samples.

## Next: Phase 3
> Manager role + full API redesign
