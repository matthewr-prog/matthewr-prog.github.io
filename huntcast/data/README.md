# HuntCast data files

All of these are plain JSON; edit and upload — no code changes needed.

## data/ads.json — sponsor banner (top of every tab)
Array of ads. Empty `[]` shows "Your ad here — advertise with HuntCast: matthewr@npigrp.com".
```json
[
  { "image": "img/ads/local-gun-shop.png", "link": "https://example.com", "alt": "Local Gun Shop — open daily", "start": "2026-11-01", "end": "2026-12-31" }
]
```
`start`/`end` are optional (inclusive, YYYY-MM-DD, compared to the phone's date). Several active ads rotate every 7 seconds. Banner image ≈ 320×50 (shown at most 44 px tall).

## data/shop.json — Shop tab
Object with a `stores` array (see `_readme` and `_example` inside the file). Fields: `name`, `url`, `description`, `image` (optional), `category`. `_example` is never displayed.

## data/regs/ — Regs tab
- `index.json`: all 50 states, agency + link, Census county names, `file` (per-state detail file or null), `season_year`, `last_checked`, `source_url`, and the default selection.
- `<ST>.json` (PA, OH, WV, MD, NY, NJ): `season_year`, `updated`, `last_checked`, `seasons[].items[]` with `ranges` = `[["YYYY-MM-DD","YYYY-MM-DD"], …]` (inclusive), `bag`, `note`, `areas` (area ids that must match the county's `county_areas`).
- **Annual refresh:** update the dates in each state file from the new regulations, set `season_year`, `updated`, `last_checked`; update `season_year`/`last_checked` in `index.json`. To add detail for another state, create `<ST>.json` in the same format and set that state's `file` and `detail` ("summary" or "full") in `index.json`.
