# EmployMe job data (`jobs.json`)

`data/jobs.json` is a JSON **array** of job objects. The app reads it at load time (network-first, so a new commit shows up the next time the app is opened). Do not put fake or unverified jobs in it. Each listing must have a real employer who authorised the posting.

| field | type | notes |
|---|---|---|
| `id` | string, unique | e.g. `asp-106138`. Never reuse an id. |
| `title` | string | required |
| `employer` | string | required |
| `location` | string | `"City, ST"` (required; used for JSON-LD address) |
| `lat`, `lon` | number or null | for radius search. null = shown only when radius is "Any" (or remote) |
| `pay_min`, `pay_max` | number or null | in `pay_unit`; `pay_max` may be null ("starting at") |
| `pay_unit` | `"hour"` `"year"` `"week"` `"month"` `"day"` or null | |
| `pay_text` | string or null | free-text pay as the employer wrote it (shown when numbers are missing) |
| `type` | `full-time` `part-time` `temp` `temp-to-hire` `contract` `direct-hire` | arrangement |
| `hours` | `full-time` `part-time` or null | optional; lets "Full-time" filter work for temp jobs |
| `shift` | `1st` `2nd` `3rd` `day` `evening` `night` `weekend` `flexible` or null | |
| `industry` | string or null | optional |
| `remote` | boolean | |
| `description` | string | plain text. Lines starting `## ` are headings, `• ` are bullets |
| `requirements` | array of strings | |
| `posted` | `YYYY-MM-DD` or null | |
| `expires` | `YYYY-MM-DD` or null | listing is hidden after this date |
| `apply` | `{method:"email"\|"url", email, url}` | `method` is the primary button; if both `email` and `url` are present the app shows both |
| `contact` | string | free text (name, phone, address) |
| `verified` | boolean | true only if the poster has been confirmed with the employer |
| `source` | string (URL) | where the listing was verified from (required for seeded jobs) |
| `last_checked` | `YYYY-MM-DD` | when the listing was last confirmed on its source |

## Adding a posting that came in by email
The **Post** tab emails Matthew a message ending with a JSON block. Paste that object into the array in `jobs.json` (after confirming the employer and the contact details), then commit.

## Refreshing the All Seasons Placement listings
`tools/build_asp_jobs.py` (kept in the project, not deployed) pulls the openings from All Seasons Placement's own public job portal and rewrites `jobs.json`. Remove listings that have been filled.

## Google for Jobs
The app writes schema.org `JobPosting` JSON-LD on each job screen, but Google only reads JSON-LD it can crawl on a real URL. For Google for Jobs eligibility, later add one static, crawlable HTML page per job (and a sitemap), generated from this file.
