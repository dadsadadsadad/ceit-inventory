# Launch and workflow notes

## Release preparation

1. Back up the target database and confirm that the backup can be restored separately.
2. Run `npm ci`, `npm run test:unit`, `npm run test:e2e`, and `npm run verify`.
3. On a development database, run `npm run test:launch:setup` and `npm run test:launch`. This covers authenticated borrowing, reservations, issue reporting, imports, inventory edits, report downloads, permissions, mobile layouts, and label pagination.
4. Apply `npm run db:migrate:deploy` with the migration-owner connection, then run `npm run test:db`. The `20260911000000_reservations_and_qr_issues` migration is additive. It preserves existing requests as immediate borrowing and existing maintenance as staff reports. The `20261007000000_stock_alerts_warranty_custom_fields` migration is also additive (new optional columns, one new table for extra fields, and indexes). Run it **before** the release that uses it goes live: the new code reads those columns, so deploying the code first would break the inventory pages until the migration is applied. The previous release keeps working against the migrated database.
5. Set the permanent HTTPS `NEXT_PUBLIC_APP_URL`, a random `REQUEST_RATE_LIMIT_SECRET`, and the borrower retention period. Run `npm run build` with the deployment environment, then start the app with the runtime database role. Do not deploy new application code against the old schema or reuse a test build.
6. Replace temporary administrator accounts, schedule daily retention cleanup, and enable routine backups.
7. From a student phone, scan one printed label on the actual school network. Confirm the public page, camera permission, request forms, and staff sign-in. Print one sheet at actual size before printing labels in bulk.

Choose the hosting region next to the database: this project's `vercel.json` pins the functions to Singapore (`sin1`) because the Supabase database is in Singapore. A function in another region pays a full round trip across the world for every query, which is the largest single cause of slow pages. If the database ever moves, change `regions` to match.

Production hosting, school account approval, physical printer alignment, and real-device camera permissions need checks in the deployment environment; automated tests do not replace these.

## Borrowing and reservations

### Limits that keep equipment moving

These defaults live in `src/lib/borrow-policy.ts` and can be changed with environment variables (see `.env.example`) without touching the code.

| Rule                                                           | Default  | Variable                     |
| -------------------------------------------------------------- | -------- | ---------------------------- |
| A reservation can start at most this many days ahead           | 3        | `BORROW_MAX_ADVANCE_DAYS`    |
| The longest a student can keep equipment                       | 7 days   | `BORROW_MAX_LOAN_DAYS`       |
| The longest a loan can run once staff extend it                | 14 days  | `BORROW_MAX_TOTAL_LOAN_DAYS` |
| Open requests or loans per student number                      | 3        | `BORROW_MAX_ACTIVE_REQUESTS` |
| An uncollected reservation releases the item after             | 2 hours  | `BORROW_PICKUP_GRACE_HOURS`  |
| An unhandled "borrow now" request stops holding the item after | 24 hours | `BORROW_PENDING_HOLD_HOURS`  |

A student with equipment still out past its return time cannot make new requests until staff confirm the return. A reservation or pending request that has lapsed shows a **Pickup missed** or **Not handled in time** label for staff, stops blocking other bookings, and is checked the next time anyone books or looks at the item (no background job is needed). The borrow form states the rules and limits its date pickers to them, and the server enforces them as well.

### How it works

- Students choose **Borrow now** or **Reserve for later** inside **Borrow equipment** on the QR page. Pickup and return use Philippine time. Same-day loans are supported.
- Pending requests and approved reservations hold their requested time. Overlapping requests cannot overbook a unit, including simultaneous submissions. Non-overlapping reservations can share that unit on different schedules.
- Approval reserves the time; it does not check out equipment or change its quantity. Staff check out an approved reservation when its pickup time arrives. Availability is checked again at handoff.
- An overdue physical loan stays unavailable until staff confirm its return. Future availability still depends on the previous borrower returning on time.
- Overdue loans show an **Overdue** badge, appear in the dashboard worklist, and can be listed with the Borrowing **Overdue** filter. Use **Set a new return time** (or **Change return time** before the deadline) on a checked-out loan to agree a new time with the borrower. Extending is refused when it would overlap another approved or pending booking; shortening is always allowed. Only the staff-recorded return time changes: the borrower's own details and the original pickup stay as submitted.
- Cancel an approved reservation with a reason to release its time. Decline a pending request to close it. Expired requests cannot be checked out and remain visible for staff to close.
- An individual asset stays at quantity 1 during checkout and uses the Deployed status. Staff cannot make it available again through ordinary inventory or maintenance edits while its loan is outstanding.
- A student's return request does not restore availability. Staff inspect the unit and confirm the return. A defect recorded after checkout is preserved on return.
- Reports include reservation type, pickup and return times, approval details, cancellation, and checkout/return history. Date filters use pickup for the reserved view, cancellation for cancelled reservations, checkout for borrowed items, and completion for returned items.

## Stock, warranty, and extra fields

- **Low stock** applies to stock records only. A record is "running low" when its quantity is at or below its alert level and "out of stock" at zero. The alert level is set per record (empty means the default of 5; 0 turns the alert off). Retired and lost records never alert. Low stock shows on the Inventory list (and its **Low stock** filter), the item page, the dashboard, the overview report, and the **Stock** report. Change a count from the item page with **Add stock** or **Use stock** (with an optional note); every change is in the audit trail.
- **Warranty** is optional on any item. "Ending soon" means within 60 days, counted in Philippine calendar days (a warranty runs through its last day). The **Warranty** report and the Inventory filter use the same rule.
- **Extra fields** are defined in Settings and shown on every item (or only those of one type or category). **Hide this field** removes it from forms but keeps what was entered. Spreadsheet columns whose heading matches a field fill it during import.
- A new equipment record can create several identical units at once (up to 50). Each gets its own asset tag and QR code, so each can be borrowed, reported, and located on its own. Stock is one record with one QR code, however many units it holds.

## Return reminders and due today

- **Due today** lists loans whose return time falls later today (Philippine time) and that are not yet late. It appears on the dashboard, as a Borrowing filter, and as a report.
- **Remind the borrower** on a loan offers a ready-written message (due soon, or late) to **Copy message** and send; it never includes private details beyond the item name. Noting the reminder records when, so two staff do not both chase the same borrower.
- Checking out equipment asks staff to confirm the borrower's ID was checked.

## Scanning a QR code

- A **signed-in staff phone** that scans any label goes straight to that item's record, ready to edit, with small **Borrow**, **Return**, and **Report a problem** shortcuts. The scan is recorded in the audit trail.
- **Anyone else** sees the public page: first, in plain colours, whether the item is available now, in use until a time (reservations only), or not available; then the details and the borrow, return, and report forms.
- Each public form carries a signed note for that item. It is checked on submission: forms posted without it, instantly after loading, or after being open for six hours are refused with a message to reload.

## Inventory checks

- **Needs attention** means equipment still in service that is Defective, Not tested, or in Poor / For repair condition. Retired and lost records are excluded. The dashboard tile, the Inventory filter, and the PDF reports all use this one definition.
- Use the Inventory filter **Last checked: Not checked in 90+ days** to build an inspection round, then select the items and choose **Record inspection (checked today)**. PC profiles are updated together with their records.

## QR issue reports

- The public **Report a problem** form asks for the reporter's name and creates a normal-priority maintenance request marked **QR issue report**, with that name shown beside it. It does not expose other reports or change the equipment's status automatically.
- Staff review the report, adjust priority, inspect equipment, record notes, and resolve it in Maintenance. Identical open QR reports are deduplicated.
- QR issues appear on the dashboard, the item record, maintenance filters, the audit trail, and CSV/PDF reports. The overview PDF includes open QR issue and reservation counts.

## Label printing

Select items in Inventory and choose **Print QR labels**, or choose a room on the QR labels page. Each batch supports up to 100 labels. Room batches omit retired items; an explicitly selected item can still be printed for archive identification.

Use A4 paper, 100% scale, and no browser headers/footers. Compact labels are 62 × 32 mm, arranged 3 × 8 with 2 mm gaps; large labels are 92 × 64 mm, arranged 2 × 4 with 4 mm gaps. Both layouts use 10 mm page margins. Print on plain label paper or stock with matching dimensions. Long names are shortened to fit, so use the large layout when more detail is needed.

The permanent website address is embedded in each QR. A browser print request is recorded in the audit trail; the app cannot confirm whether a physical printer completed the job.

## Other safety limits

These are enforced by the server, not just the forms.

| Where            | Limit                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff sign-in    | 5 failed attempts lock an account for about 15 minutes (an administrator can unlock it)                                                                                               |
| Staff sessions   | 7 days, and at most 5 signed-in devices per account                                                                                                                                   |
| Public requests  | Borrow, return, and issue forms are rate-limited per device                                                                                                                           |
| Borrower details | Redacted after the retention period (365 days by default)                                                                                                                             |
| Reports          | The page previews 500 rows per table; a PDF holds up to 2,000 rows and a CSV up to 10,000. Larger requests are refused with a message to narrow the filters, never silently cut short |
| Imports          | 10 MB and 1,000 rows per file                                                                                                                                                         |
| New units        | Up to 50 identical equipment units created at once                                                                                                                                    |
| Extra fields     | Up to 40 fields, 500 characters per text answer                                                                                                                                       |
| Photos           | 4 per item, 3 MB each                                                                                                                                                                 |
| QR labels        | 100 per batch                                                                                                                                                                         |
| Bulk changes     | Up to 10,000 selected records                                                                                                                                                         |
| Borrowing        | The rules in the table above, plus a cap on the quantity of supplies in one request                                                                                                   |

## Database connections

The app reuses one Prisma client per process. `DB_POOL_MAX` defaults to 5 and accepts 1–20; database connection and idle timeouts are bounded. Keep the sum of connection limits for all running instances, maintenance tools, and test servers below the database provider's limit. For serverless hosting, use the provider's transaction-pool endpoint for runtime connections and a separate migration connection.

Speed comes first from keeping the app and database in the same region (see above), then from fewer round trips: pages run their queries together, a saved change re-renders its page once (the live-update refresh skips the change this tab just made), every section has a page-shaped loading placeholder, and a progress bar shows the moment a link is pressed.

Session lookups are shared only within a React server render, so the layout and page do not duplicate the same lookup. Private page data is not cached across users. Live-update revision checks run every five seconds against the current page's relevant tables; overlapping reads are coalesced and results are reused for two seconds. Test `/api/live` through the deployed proxy, including automatic reconnection, polling fallback, and a deactivated staff session. Background tabs should disconnect, and remote changes should wait while a form has unsaved edits.

## Dependency patches

This release updates Next.js and its ESLint configuration to 16.3.4. The lockfile includes patched Sharp, URI parsing, and browser-mapping dependencies. The MySQL2 override patches Prisma's bundled driver without changing the app's PostgreSQL adapter; Prisma's CLI remains aligned with the 7.9.1 client. The ESLint js-yaml override is 4.3.2. Run `npm audit` with future dependency updates and use `npm ci` to reproduce the verified installation.

## Test data cleanup

The isolated suite writes `INVENTORY_DB_SCHEMA` and generated credentials to `.env.e2e.local`. Never copy this file into production. The normal application does not use it unless explicitly started with that file. The launch test builds with the test website address, so run `npm run build` again with the deployment environment before starting or shipping the normal app.

After stopping the test server, a database administrator may drop the exact `ceit_test_launch_*` schema reported by setup, then remove `.env.e2e.local`. Verify the schema name before removal. Keep the ordinary inventory schema and its migrations intact.
