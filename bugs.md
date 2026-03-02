# Mobile UI/UX Audit Report — Workout Tracking

**Device:** iPhone 14 Pro Max (430x932px, 3x DPR, touch)
**Theme:** Dark + Light mode verified
**Date:** March 2, 2026

---

## BLOCKING Issues (2)

| # | Issue | Where | Details |
|---|-------|-------|---------|
| **B1** | **Horizontal overflow (48px)** | `page.tsx` grid containers + `WorkoutCard.tsx` | Body scrollWidth=478px vs viewport 430px. Long exercise summaries cause grid tracks to expand beyond container. Users can accidentally scroll horizontally. |
| **B2** | **Drag-and-drop dismisses drawer** | `WorkoutForm.tsx`, `PresetForm.tsx`, `PresetManager.tsx` | Only `PointerSensor` configured — no `TouchSensor`. Vertical drag is captured by vaul's swipe-to-dismiss, closing the drawer instead of reordering exercises. **Exercise reordering is 100% broken on mobile.** |

---

## MAJOR Issues (5)

All relate to **iOS auto-zoom** — any `<input>` or `<textarea>` with font-size < 16px triggers Safari's zoom-on-focus:

| # | Element | Font Size | File |
|---|---------|-----------|------|
| M1 | Weight per-set inputs | 12px (`text-xs`) | `ExerciseRow.tsx` |
| M2 | Reps per-set inputs | 12px, height 32px | `ExerciseRow.tsx` |
| M3 | Sets/Quick fill spinners | 14px (`text-sm`) | `ExerciseRow.tsx` |
| M4 | Note textarea | 14px | `WorkoutForm.tsx` |
| M5 | Run distance/minutes/seconds inputs | 14px | `WorkoutForm.tsx` |

---

## MINOR Issues — Undersized Touch Targets (12)

Apple HIG requires 44x44px minimum. These all fall short:

| # | Element | Actual Size | File |
|---|---------|-------------|------|
| m1 | Delete buttons on workout cards | 28x28px | `WorkoutCard.tsx` |
| m2 | Drag handles in workout form | 20-28px | `WorkoutForm.tsx` |
| m3 | BW (bodyweight) buttons | 31x28px | `ExerciseRow.tsx` |
| m4 | Done button | 83x40px (height) | `WorkoutForm.tsx` |
| m5 | Add Exercise button | 259x40px (height) | `WorkoutForm.tsx` |
| m6 | Remove Exercise button | 372x36px (height) | `ExerciseRow.tsx` |
| m7 | New Workout button | 144x40px (height) | `page.tsx` |
| m8 | Delete dialog buttons | 348x36px (height) | `DeleteConfirmDialog.tsx` |
| m9 | Delete dialog close (X) | 16x16px | `DeleteConfirmDialog.tsx` |
| m10 | Theme toggle | 36x36px | Layout |
| m11 | Preset manager edit/delete buttons | 28-32px | `PresetManager.tsx` |
| m12 | Toolbar buttons (Strength/Run/Note/Date) | ~24px height | `WorkoutForm.tsx` |

---

## ACCESSIBILITY Issues (4)

| # | Issue | Fix |
|---|-------|-----|
| A1 | `DialogContent` missing `DialogTitle` (10+ console errors) | Add `<VisuallyHidden><DialogTitle>` to all Drawer/Sheet components |
| A2 | Missing `aria-describedby` on dialogs (10+ warnings) | Add `aria-describedby={undefined}` or proper description |
| A3 | `aria-hidden` blocks focused element (theme toggle) | Use `inert` or manage focus before hiding |
| A4 | No `aria-label` on icon-only buttons (preset picker, edit, delete, drag) | Add descriptive labels |

---

## COSMETIC Issues (3)

| # | Element | Current | Suggested |
|---|---------|---------|-----------|
| C1 | Set labels ("Set 1", "Set 2") | 9px | 11-12px |
| C2 | Quick fill label | 10px | 12px |
| C3 | Run input labels (Distance/Minutes/Seconds) | 10px | 12px |

---

## What Passed

- Workout list date grouping, card content, run badges
- Header hide/show on scroll, bottom nav (107.5x64px per button — great)
- Full-screen drawer opening, form pre-loading on edit
- Preset picker and selection flow
- Run tracking with pace auto-calculation
- Split reminder banner logic (correctly hidden when today's workout matches)
- Light/dark mode rendering and contrast

---

## Top 5 Recommended Fixes (Priority Order)

1. **Fix horizontal overflow** — Add `overflow-hidden` to grid containers + `min-w-0` on WorkoutCard flex children
2. **Fix drag-and-drop on mobile** — Add `TouchSensor` with `delay: 250ms` + `data-vaul-no-drag` on drag handles
3. **Fix iOS auto-zoom** — Set `text-base` (16px) on all form inputs in ExerciseRow + WorkoutForm
4. **Increase touch targets** — Priority: delete buttons, drag handles, dialog close button → `min-h-[44px] min-w-[44px]`
5. **Fix accessibility warnings** — Add `VisuallyHidden` DialogTitle to Drawers/Sheets, `aria-label` to icon buttons
