# ✅ Phase 4 Complete — Worker Dashboard Redesign

**Estimated effort:** ~4 days (Week 3)

## New files

| File | Purpose |
|------|---------|
| `client/src/components/WorkerProgressTracker.tsx` | Animated progress ring + live metrics strip in annotate panel |
| `client/src/components/FeedbackInbox.tsx` | Full feedback inbox with HP badges, expandable cards, guidelines CTA |
| `client/src/components/WorkerMetricsCard.tsx` | Live QA/HP quality bars + next-level promotion checklist |

## Modified files

| File | Change |
|------|--------|
| `client/src/pages/TaskerDashboard.tsx` | Wired all 3 components; skip quota UI; `startTask` on open |
| `server/routers.ts` | `getFeedback` enriched with honey pot check results |

---

## WorkerProgressTracker (annotate panel header)

```
┌──────────────────────────────────────────────────────────┐
│  [ring: 14/20]  اليوم: 14/20  🔥 5 أيام  QA: 91%  🍯 95%  │
└──────────────────────────────────────────────────────────┘
```

- SVG animated ring showing daily goal progress
- Green when goal reached, indigo in progress
- QA & HP badges from live `worker_metrics` (refresh every 60s)
- Red warning banner if HP < 50%
- Hidden when no active task

## FeedbackInbox (feedback panel)

- Grouped: rejected → pending → approved
- Filter chips (all / rejected / approved)
- Orange warning banner with "راجع الإرشادات" CTA when rejections exist
- Each card expands to show full task content + QA note
- Honey pot badge (🍯 HP ✓ / 🍯 HP ✗) on HP tasks
- Explanation tooltip on failed HP items

## WorkerMetricsCard (profile panel)

- QA pass rate bar (green ≥ 90%, yellow ≥ 70%, red below)
- Honey pot accuracy bar with suspension warning at < 50%
- Average time per task
- Next-level promotion checklist (3 items with ✓/✗)
- Live data from `workerMetrics.getForWorker` (StatsWorker computed)
- Skeleton loader while fetching

## Skip Rate-Limit UI (annotate panel)

- Quota badge: "متبقي 2 تخطيات من أصل 3 هذه الساعة"
- Red warning: "⛔ وصلت لحد التخطيات" with countdown in minutes
- Skip button disabled when quota = 0

## getFeedback enrichment

Each feedback item now includes:
- `isHoneyPotCheck: boolean`
- `honeyPotPassed: boolean | null`

## Next: Phase 5
> QA Dashboard redesign — keyboard shortcuts, batch review, annotation comparison
