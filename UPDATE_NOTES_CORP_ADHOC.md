# Corp Fund Ad-hoc Payment and Dashboard Balance Update

## Changes

- The Dashboard shows one `Remaining Corp Fund` amount, calculated as all current-month Corpus Fund collections plus the net Corpus Fund ledger deposits/withdrawals.
- The Dashboard receives only the aggregate ledger net balance, not the detailed ledger descriptions.
- The Corpus Fund page supports `Ad-hoc payment from a flat` as a new entry mode. Select a flat, enter an amount, optionally add a note and month, then save.
- Ad-hoc flat payments are recorded as Corpus Fund deposits in the existing ledger, so they increase the remaining Corp Fund balance without changing monthly Maintenance or monthly Corp Fund billing calculations.
- Existing deposit and withdrawal entry modes remain available.

## Verification

- TypeScript/TSX syntax transpilation passed for the modified source files.
- Full type checking/build was not completed because the available dependency installation is missing the Node and Vite type definitions.
