# ✅ Phase 3 Complete — Manager Role + API Redesign

**Estimated effort:** ~5 days (Week 2–3)

## New files

| File | Purpose |
|------|---------|
| `server/managerRouter.ts` | 587-line dedicated manager router (18 procedures) |
| `server/skipRateLimiter.ts` | In-process skip quota (3 skips/hour/project) |
| `client/src/pages/ManagerDashboard.tsx` | Full 5-tab management UI (718 lines) |

## Modified files

| File | Change |
|------|--------|
| `server/_core/trpc.ts` | Added `managerProcedure`, `qaProcedure`, `taskerProcedure` |
| `server/routers.ts` | Wired `managerRouter`; updated `skipTask` with rate-limit; added `getSkipStatus` |
| `shared/const.ts` | Added `ROLES`, `Role`, `SKIP_RATE_LIMIT`, `SKIP_WINDOW_MS` |
| `client/src/App.tsx` | Added `/manager` and `/manager/projects` routes |
| `client/src/components/ArabAnnotatorsDashboardLayout.tsx` | Manager nav items, role label |
| `client/src/pages/Login.tsx` | Redirect `manager` → `/manager` |
| `client/src/pages/TaskerDashboard.tsx` | Skip quota UI; `startTask` on task open |
| `client/src/pages/Admin.tsx` | Manager role option in user edit |

---

## Manager Dashboard — 5 tabs

### 1. نظرة عامة (Overview)
- KPI strip: progress %, 24h throughput, QA pass rate, Fleiss' κ
- Donut chart: task status breakdown
- Worker leaderboard (top 10 by volume)
- One-click metrics recompute

### 2. قائمة المراجعة (QA Queue)
- Paginated IN_QA task list with annotation result preview
- AI suggestion badge per task
- Three actions per task: **Approve** / **Edit & Approve** / **Reject** (with feedback)
- Live refresh every 30s

### 3. الفريق (Team)
- Assign workers/QA to project from user pool
- Per-worker stats: volume, QA pass rate, HP accuracy
- Skill level picker (1–5) with instant update
- Unsuspend auto-suspended workers
- Remove from project

### 4. الدُّفعات (Batches)
- Create batches with configurable HP rate (0–50%) and QA rate (0–100%)
- Visual batch cards with status badges

### 5. IAA
- Fleiss' κ big number with colour-coded quality label
- Cohen's κ bar chart per annotator pair
- Manual recompute trigger

---

## New tRPC procedures

| Router | Procedure | Description |
|--------|-----------|-------------|
| `manager` | `getDashboard` | Full project overview data |
| `manager` | `getProjects` | Projects scoped to manager's assignments |
| `manager` | `createProject` | Create project (was admin-only) |
| `manager` | `updateProjectStatus` | pause / complete projects |
| `manager` | `getAvailableWorkers` | All taskers/QA for assignment |
| `manager` | `assignWorker` | Assign to project with role |
| `manager` | `removeWorker` | Remove from project |
| `manager` | `getTeam` | Current project team |
| `manager` | `getWorkerMetrics` | Leaderboard data |
| `manager` | `setWorkerSkillLevel` | Manual skill override |
| `manager` | `unsuspendWorker` | Lift auto-suspension |
| `manager` | `recomputeMetrics` | Force StatsWorker run |
| `manager` | `getQAQueue` | IN_QA tasks with annotations |
| `manager` | `qaApprove` | Approve via state machine |
| `manager` | `qaReject` | Reject + re-queue via state machine |
| `manager` | `qaEditAndApprove` | Edit result then approve |
| `manager` | `getIAAScores` | All IAA rows for project |
| `manager` | `triggerIAACompute` | Force IAAWorker run |
| `manager` | `createBatch` | New batch |
| `manager` | `getBatches` | List batches |
| `manager` | `getTaskHistory` | State machine audit log |
| `tasker` | `startTask` | ASSIGNED → IN_PROGRESS |
| `tasker` | `getSkipStatus` | Skip quota for UI display |

---

## Role-based procedure guards (trpc.ts)

| Procedure | Allowed roles |
|-----------|---------------|
| `adminProcedure` | admin |
| `managerProcedure` | admin, manager |
| `qaProcedure` | admin, manager, qa |
| `taskerProcedure` | admin, manager, tasker |
| `protectedProcedure` | any authenticated user |

---

## Skip Rate Limiter

- **Limit:** 3 skips per worker per project per hour
- **Storage:** in-process Map (upgrade to Redis for multi-node)
- **UI:** badge in skip modal showing remaining skips + countdown
- **Error:** Arabic message with retry time in minutes

## Next: Phase 4
> Worker Dashboard redesign — feedback inbox, progress tracker, honey pot result display
