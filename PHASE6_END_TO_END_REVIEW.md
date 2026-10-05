# Phase 6 — Is Blocks end-to-end consistency review

## Changes

- Audited the parallel calculation helpers used by web Summary, dashboard, print, and export views.
- Fixed the `src/lib.ts` calculation path so its maintenance helper accepts the full flat list and the `Is Blocks` flag, applies hybrid allocation only when enabled, and honors the saved billing expense total.
- Fixed `src/lib.ts` summary snapshots to pass `Is Blocks` through to per-flat calculations. This keeps live Summary calculations consistent with the Months screen and server snapshots.
- Added regression tests for normal billing when `Is Blocks` is off, hybrid block allocation when enabled, and block-aware summary snapshots retaining expense allocation metadata.
- Reviewed existing web and mobile monthly workbook paths: both receive a `maintOf` callback from their screen and use that callback for expected maintenance amounts. Financial Summary and dashboard paths pass `Is Blocks` into the shared calculation helpers.

## Expected behavior

- `Is Blocks = false`: existing association-wide billing remains in effect even when historical expense rows contain block allocation metadata.
- `Is Blocks = true`: for divide-by-expenses months, block-specific expense amounts are allocated only among flats in the matching block; the shared portion is allocated using the configured divisor.
- Fixed common-amount and per-square-foot methods remain unchanged by block allocation.
- Historical snapshots retain expense allocation metadata and use the block setting active when the snapshot is created.

## Validation

- Regression tests were added, but have not been executed in this extracted workspace because dependencies are not installed locally.
- Full TypeScript typecheck and full Vitest suite remain pending until dependencies are installed.
- No GitHub push or deployment was performed.
