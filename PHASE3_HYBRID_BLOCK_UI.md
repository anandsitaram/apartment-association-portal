# Phase 3 — Hybrid block billing UI

## Changes

- Added an optional **Block / Building** field to the Flats table and Add Flat form. Blank remains valid for single-building associations.
- Flat saves and new-flat requests include the block value; the existing API/database model supports this field.
- Added per-expense allocation controls: **Association-wide** (default) or **Specific block**.
- Block-specific expense rows can select from block names currently assigned to flats. If no blocks have been configured, the Expenses screen explains that blocks must first be assigned in the Flats tab.
- Existing expense rows without allocation metadata continue to behave as association-wide expenses.
- Added brief guidance explaining how association-wide and block-specific expense allocation works.

## Validation

- TypeScript transpile/syntax checks passed for the modified UI files and related type/validation/calculation files.
- Full `npm run typecheck` could not run because local dependencies are incomplete (`@types/node` and `vite/client` type definitions are missing).
- `npm test` could not run because the local Vitest executable is unavailable.
- Not pushed to GitHub or deployed.

## Notes

- Phase 2's calculation engine remains responsible for splitting block-specific expenses among flats assigned to the matching block.
- Existing monthly billing totals, payments, and single-building configurations are preserved.
