# Phase 4 — Block reports and Is Blocks setting

## Changes

- Added the `isBlocks` setting (`Is Blocks`) under Settings → General. It defaults to `false` for existing and new configurations unless explicitly enabled.
- When `Is Blocks` is disabled, the application uses normal association-wide maintenance calculation even if old expense rows contain block allocation metadata.
- When enabled, expense-based billing can allocate block-specific expenses only among flats assigned to the matching block; association-wide expenses remain shared.
- Block/Building input and block expense allocation controls are shown only when `Is Blocks` is enabled.
- Added a Summary report for the latest month showing association-wide expense totals, block-specific expense totals, and the number of flats in each block.
- Updated web and mobile maintenance due calculations, month totals, reminders, and Excel export callbacks to respect the setting where their settings context is available.
- Added explicit opt-in to block-allocation calculation tests so default behavior remains standard billing.

## Validation

- TypeScript transpile/syntax checks passed for 15 modified TypeScript/TSX files.
- Full `npm run typecheck` and Vitest tests were not run; this workspace previously lacked required type definitions and the Vitest executable.
- Not pushed to GitHub and not deployed.

## Behavior

- `Is Blocks = Off`: standard association-wide maintenance calculation.
- `Is Blocks = On`: block fields and expense allocation controls are enabled; block expenses are split within their configured block.
