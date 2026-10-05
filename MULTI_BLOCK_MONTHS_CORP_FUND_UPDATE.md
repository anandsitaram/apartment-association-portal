# Multi-Block Months and 2/3 BHK Corp Fund Update

- Months remain one record per calendar month; blocks are a filter/allocation dimension.
- Added 2 BHK and 3 BHK Corp Fund amounts (`corp_2bhk`, `corp_3bhk`). Blank values preserve legacy Corp Fund behavior.
- Block-specific expenses continue to be allocated only to flats in that block.
- Months web and mobile views support All Blocks / individual block filtering.
- When Maintenance + Corp Fund is combined, the UI and Excel export still show separate Maintenance Fund and Corp Fund expected columns, while the collected payment remains stored as one combined Maintenance payment.
- Existing months remain backward compatible through fallback to the legacy Corp Fund rate/value.
