# PyramydalV2 Resume Prompt (Vacation Handoff)

Use this prompt when resuming work:

---

Continue development on `pyramydalV2` from current local state.

## Current branch/worktree state
- Uncommitted changes exist in:
  - `ui/src/App.tsx`
  - `ui/src/App.css`
- Also untracked:
  - `ui/src/pyramydalV2.code-workspace` (likely unrelated, do not include unless requested).

## What was implemented already
- Editable column headers in main table:
  - Double click header label to rename.
  - Inline editor with Save/Cancel.
  - Labels persisted in localStorage key `pyramydal.mainRows.columnLabels.v1`.
- Search UX improvements:
  - Larger custom clear `x` button in search input.
  - Search column selector and mode selector (`Contains`, `Has value`, `Is empty`).
- Combined filtering logic:
  - Multi-rule AND filtering engine in frontend.
  - Row match utility supports text contains + value presence/absence.
- Excel-like header filter UI:
  - Filter button in each filterable header (`▾`).
  - Per-column popover with mode/value + Apply/Clear/Close.
  - Active filter indicator on header filter button.
- Infinite scroll tuning:
  - Earlier prefetch threshold.
  - Extra proactive top-position prefetch effect to avoid delayed loading.

## Important constraints/behavior
- Current filtering is client-side over currently loaded rows.
- Full DB-wide multi-column filtered query is NOT implemented yet.
- Existing backend search (`searchMainRows`) is still used for global text search path.

## Primary next objective
Implement robust, production-ready **server-side filtering + search combination** so results are correct across full dataset, not just loaded pages.

## Proposed next tasks (in order)
1. Design backend API query contract:
   - `searchField`, `searchMode`, `searchQuery`
   - `filters: Array<{ field, mode, query }>`
   - pagination inputs (`page`, `limit`) and total count metadata.
2. Implement backend query builder:
   - Safe allowlist of searchable/filterable columns.
   - Parameterized SQL only.
   - Correct handling for `has_value`/`is_empty` for numeric/text/date columns.
3. Update `ui/src/api/mainRows.ts`:
   - Add typed API call for combined search+filters.
4. Update `ui/src/App.tsx`:
   - Route header filters and global search to backend endpoint.
   - Keep UI behavior unchanged.
5. Preserve infinite scroll behavior with filtered dataset pagination.
6. Add regression tests/manual matrix:
   - Example: `client contains PESTER` AND `nr_fisa contains 123`.
   - Example: `freze_mici has_value` AND `status contains in_lucru`.

## Validation checklist
- No TypeScript/lint errors.
- Header rename still works.
- Header filter popover works on all intended columns.
- Combined filters return expected rows from full DB (not only loaded rows).
- Infinite loading still triggers smoothly without aggressive scroll input.

## Run commands
- UI dev server:
  - `cd ui && npm run dev -- --host 0.0.0.0 --port 5173`
- Open:
  - `http://localhost:5173/`

## Caution
- Do not revert unrelated local changes.
- Do not commit `ui/src/pyramydalV2.code-workspace` unless explicitly requested.

---

When resuming, first inspect `git status`, then continue from this plan.
