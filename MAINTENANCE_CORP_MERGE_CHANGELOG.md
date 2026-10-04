# Maintenance + Corp Fund merge option

This update adds a month-specific `Merge Maintenance and Corp Fund?` setting to the web and mobile Months screens.

- When enabled, the web Maintenance table displays the combined per-flat charge and a single combined payment input; the separate per-flat Corp Fund payment table is hidden.
- The mobile payment sheet displays one combined amount field.
- Combined payments are allocated internally to the maintenance and Corp Fund buckets using the existing payment-split setting. Database payment fields remain separate so Corp Fund accounting, ledger activity, receipts, and monthly summaries retain their internal breakdown.
- The selected maintenance rounding rule applies to the combined current-month charge when merge is enabled. Supported options are none (2 decimals), nearest ₹1, round up ₹1, round up to ₹50, and round up to ₹100.
- Corp Fund charges remain calculated using their own rate/method and Corp Fund rounding setting. The maintenance bucket absorbs the combined-charge rounding adjustment.
- The merge setting is saved in the month notes JSON and is copied when a new month explicitly copies calculation settings from a source month.

Validation performed: TypeScript/TSX syntax transpilation and direct shared-calculation checks passed. Full package typecheck/test/build was not run because dependency installation did not complete in this environment.
