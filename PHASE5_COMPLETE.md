# ✅ Phase 5 Complete — QA Dashboard Redesign

**Estimated effort:** ~4 days (Week 3–4)

## Files changed

| File | Change |
|------|--------|
| `client/src/pages/QADashboard.tsx` | Full rebuild — 417 → 745 lines |

---

## New layout: split-pane

```
┌─────────────────┬────────────────────────────────────────┐
│  Queue list     │  Focused review pane                   │
│  (280px)        │  (flex-1)                              │
│                 │                                        │
│  ► مهمة #42    │  [Task content]                        │
│    مهمة #43    │  [Annotation result]                   │
│    مهمة #44    │  [AI badges]                           │
│                 │  [Action bar + quick reject chips]     │
└─────────────────┴────────────────────────────────────────┘
```

- Left pane: scrollable queue with skill badges, time spent, HP badge
- Right pane: full task + annotation + actions
- Navigation arrows between items (+ J/K keyboard)

---

## Keyboard shortcuts (expanded from v3)

| Key | Action |
|-----|--------|
| J / ↓ | Next item |
| K / ↑ | Previous item |
| A / Enter | Approve |
| R / Delete | Reject (focus textarea) |
| **E** | **Edit result + approve (new)** |
| **B** | **Toggle batch mode (new)** |
| **S** | **Toggle split/compare view (new)** |
| ? / / | Shortcuts help |
| Esc | Cancel / deselect |

---

## Annotation comparison (split view)

- Press **S** or toggle "عرض مقارن"
- Shows current annotation left-side and other annotator's annotation right-side
- Only visible when ≥ 2 annotators annotated same task
- Helps detect disagreements faster

---

## Batch review

- Toggle with **B** or the "دُفعة" button
- Checkbox per item, "تحديد الكل"
- **Batch approve** button
- **Preset-reason batch reject** chips — one click rejects all selected with same reason
- Presets: التصنيف غير صحيح / إجابة عشوائية / لم يقرأ المحتوى / يتناقض مع الإرشادات / Honey Pot فاشل

---

## Quick reject chips

Individual item rejection — no need to type manually:
- "التصنيف غير صحيح"
- "إجابة عشوائية"
- "لم يقرأ المحتوى"
- "يتناقض مع الإرشادات"
- "مهمة Honey Pot فاشلة"

---

## Other improvements

| Feature | Detail |
|---------|--------|
| Session stats strip | "5 قُبل · 2 رُفض" counter in top bar |
| Queue drain bar | Progress bar showing % of queue cleared |
| Project filter | Dropdown to filter queue by project |
| Skill level badge | ★N next to each annotator's name |
| Time spent | Shows time worker spent on task |
| HP badge | 🍯 tag on honey pot tasks in list |
| Edit mode dialog | Edit JSON result then approve in one step |
| Reject requires feedback | Submit disabled until feedback is non-empty |
| AI toggle per session | Eye icon — hide/show AI badges |
| Auto-advance | After approve/reject, focus moves to next item |

## Next: Phase 6
> Tests + deployment hardening (integration tests for state machine, CI pipeline, Railway config)
