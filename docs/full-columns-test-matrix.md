# Full Columns Test Matrix

## API Contract

- `GET /api/main-rows` returns expanded field set for each row.
- `POST /api/main-rows` accepts expanded editable fields.
- `PATCH /api/main-rows/{id}` updates expanded editable fields only.
- Derived fields (`timp_per_buc`, `ore_totale`, `valoare_*`, `utilaj_folosit`, etc.) are not directly editable.

## Pagination + Search

- Initial load opens at bottom with highest IDs.
- Scrolling up fetches older pages without duplicates.
- Search applies on user action and does not trigger infinite loading flicker.
- Search result row can still be used as composer template.

## Grid Rendering

- Horizontal scrolling works with all columns visible.
- Sticky header remains aligned while scrolling both axes.
- Null values render as `-`.
- Numeric cells render stable formatting.

## Composer Flow

- `Use as template` fills full draft fields.
- `Create new row` succeeds with required fields and optional expanded fields.
- Invalid numeric machine fields are blocked with clear error.
- `Clear` resets composer to defaults.

## Row Update/Delete

- Existing row save still updates core editable fields.
- Delete still requires typed confirmation.
- Deleted row disappears from current dataset.

## Regression

- Build passes: `npm --prefix ui run build`.
- Backend syntax check passes: `python3 -m py_compile backend/app/main.py`.
