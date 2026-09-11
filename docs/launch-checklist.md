# Launch and workflow notes

## Release preparation

1. Back up the target database and confirm that the backup can be restored separately.
2. Run `npm ci`, `npm run test:unit`, `npm run test:e2e`, and `npm run verify`.
3. On a development database, run `npm run test:launch:setup` and `npm run test:launch`. This covers authenticated borrowing, reservations, issue reporting, imports, inventory edits, report downloads, permissions, mobile layouts, and label pagination.
4. Apply `npm run db:migrate:deploy` with the migration-owner connection, then run `npm run test:db`. The `20260911000000_reservations_and_qr_issues` migration is additive. It preserves existing requests as immediate borrowing and existing maintenance as staff reports.
5. Set the permanent HTTPS `NEXT_PUBLIC_APP_URL`, a random `REQUEST_RATE_LIMIT_SECRET`, and the borrower retention period. Run `npm run build` with the deployment environment, then start the app with the runtime database role. Do not deploy new application code against the old schema or reuse a test build.
6. Replace temporary administrator accounts, schedule daily retention cleanup, and enable routine backups.
7. From a student phone, scan one printed label on the actual school network. Confirm the public page, camera permission, request forms, and staff sign-in. Print one sheet at actual size before printing labels in bulk.

Production hosting, school account approval, physical printer alignment, and real-device camera permissions need checks in the deployment environment; automated tests do not replace these.

## Borrowing and reservations

- Students choose **Borrow now** or **Reserve for later** inside **Borrow equipment** on the QR page. Pickup and return use Philippine time. Same-day loans are supported.
- Pending requests and approved reservations hold their requested time. Overlapping requests cannot overbook a unit, including simultaneous submissions. Non-overlapping reservations can share that unit on different schedules.
- Approval reserves the time; it does not check out equipment or change its quantity. Staff check out an approved reservation when its pickup time arrives. Availability is checked again at handoff.
- An overdue physical loan stays unavailable until staff confirm its return. Future availability still depends on the previous borrower returning on time.
- Cancel an approved reservation with a reason to release its time. Decline a pending request to close it. Expired requests cannot be checked out and remain visible for staff to close.
- An individual asset stays at quantity 1 during checkout and uses the Deployed status. Staff cannot make it available again through ordinary inventory or maintenance edits while its loan is outstanding.
- A student's return request does not restore availability. Staff inspect the unit and confirm the return. A defect recorded after checkout is preserved on return.
- Reports include reservation type, pickup and return times, approval details, cancellation, and checkout/return history. Date filters use pickup for the reserved view, cancellation for cancelled reservations, checkout for borrowed items, and completion for returned items.

## QR issue reports

- The public **Report a problem** form creates a normal-priority maintenance request marked **QR issue report**. It does not expose other reports or change the equipment's status automatically.
- Staff review the report, adjust priority, inspect equipment, record notes, and resolve it in Maintenance. Identical open QR reports are deduplicated.
- QR issues appear on the dashboard, the item record, maintenance filters, the audit trail, and CSV/PDF reports. The overview PDF includes open QR issue and reservation counts.

## Label printing

Select items in Inventory and choose **Print QR labels**, or choose a room on the QR labels page. Each batch supports up to 100 labels. Room batches omit retired items; an explicitly selected item can still be printed for archive identification.

Use A4 paper, 100% scale, and no browser headers/footers. Compact labels are 62 × 32 mm, arranged 3 × 8 with 2 mm gaps; large labels are 92 × 64 mm, arranged 2 × 4 with 4 mm gaps. Both layouts use 10 mm page margins. Print on plain label paper or stock with matching dimensions. Long names are shortened to fit, so use the large layout when more detail is needed.

The permanent website address is embedded in each QR. A browser print request is recorded in the audit trail; the app cannot confirm whether a physical printer completed the job.

## Database connections

The app reuses one Prisma client per process. `DB_POOL_MAX` defaults to 5 and accepts 1–20; database connection and idle timeouts are bounded. Keep the sum of connection limits for all running instances, maintenance tools, and test servers below the database provider's limit. For serverless hosting, use the provider's transaction-pool endpoint for runtime connections and a separate migration connection.

## Dependency patches

This release updates Next.js and its ESLint configuration to 16.3.4. The lockfile includes patched Sharp, URI parsing, and browser-mapping dependencies. The MySQL2 override patches Prisma's bundled driver without changing the app's PostgreSQL adapter; Prisma's CLI remains aligned with the 7.9.1 client. The ESLint js-yaml override is 4.3.2. Run `npm audit` with future dependency updates and use `npm ci` to reproduce the verified installation.

## Test data cleanup

The isolated suite writes `INVENTORY_DB_SCHEMA` and generated credentials to `.env.e2e.local`. Never copy this file into production. The normal application does not use it unless explicitly started with that file. The launch test builds with the test website address, so run `npm run build` again with the deployment environment before starting or shipping the normal app.

After stopping the test server, a database administrator may drop the exact `ceit_test_launch_*` schema reported by setup, then remove `.env.e2e.local`. Verify the schema name before removal. Keep the ordinary inventory schema and its migrations intact.
