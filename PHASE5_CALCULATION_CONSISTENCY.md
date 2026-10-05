# Phase 5 — Block calculation consistency and archived summaries

## Changes

- Passed the `Is Blocks` setting into shared summary snapshots so live financial summaries use the same maintenance allocation as the Months screen.
- Updated the web MonthBar snapshot to respect `Is Blocks` when computing expected and collected totals.
- Added an optional `isBlocks` parameter to the server snapshot calculation. Existing callers and older tests retain normal billing by default.
- Month deletion archives and month-completion snapshots now use the saved `Is Blocks` setting, so frozen dues and carry-forward calculations use the correct block allocation when enabled.
- Scheduled overdue reminders and admin notifications targeting unpaid flats now use block-aware dues when `Is Blocks` is enabled. Their flat queries include block and area fields required for the calculation.
- Preserved expense allocation metadata (`allocationScope` and `block`) in archived snapshots so block allocation details remain available in historical summaries.
- Added a server-calculation test covering block-aware archived dues, retained expense allocation metadata, and normal billing when `Is Blocks` is disabled.

## Validation

- TypeScript syntax/transpile checks passed for 8 modified TypeScript/TSX files.
- `npm test -- --reporter=dot` could not run because `vitest` is not installed in this extracted workspace.
- `npm run typecheck` could not run because `@types/node` and `vite/client` type definitions are unavailable in this extracted workspace.
- Not pushed to GitHub and not deployed.
