# CEIT Inventory

Inventory management for CEIT rooms, equipment, PCs, supplies, and assets with QR codes. During development, the application uses Supabase PostgreSQL. When the school launches it, the same code can move to the school's own PostgreSQL server without an application rewrite.

See [the code guide](docs/code-guide.md) for the folder layout, formatting commands, and database maintenance.

## What is included

- Room and location management
- Item categories, individually tracked equipment (one record, asset tag, and QR code per physical unit), and counted stock records (one record and one QR code per kind of stock)
- **Low-stock alerts** for stock: each record can set its own alert level (5 by default, 0 turns it off). Running low and out of stock show on the Inventory list, the item page, the dashboard, and in reports
- **Warranty end dates** (optional) with a warranty report and an "ending soon" alert 60 days ahead
- **Extra fields** that staff define in Settings (text, number, date, yes or no, or a list of choices) and fill in on any item, optionally only for one type or category
- Optional "Licensed?" on installed software
- Per-PC/Mac hardware and software descriptions, structured technical details, and installed-software records
- Automatic asset tags in the existing `INV-CAT-ST-ROOM-0001` format and a unique QR code for every new equipment record
- Item-wide last-checked dates, including a one-click inspection record
- Item status, condition, and location updates with an audit history
- Individual QR labels and A4 label sheets for selected items or a room (24 compact or 8 large labels per sheet)
- Phone camera scanning with a cross-browser decoder and a manual-code fallback
- Multi-word search (every word must match, across name, tag, serial, room, MAC/IP, and more), filters, sorting, and page navigation for status, room, category, type, condition, items that need attention, and items not checked in 90+ days
- Bulk status, condition, location, and inspection changes for selected items, including **Record inspection** for a whole room
- CSV/XLSX import that copes with the files people really have: any column order, missing or extra columns, empty rows, totals, and untidy values. **Check file** reports exactly what would happen without saving anything, and **Import** saves every row that can be understood
- **Hardware and Software views** next to the Inventory list: every processor, memory size, storage, graphics part, operating system, and installed program, grouped, searchable, and showing which PCs have it, with license expiry for software
- **Reports** you generate on the page first and then print right there or download as a PDF or CSV: overview, inventory, stock, warranty, PC register, hardware, software, borrowing, maintenance, and audit trail, each with its own filters and a set of one-click quick reports (overdue loans, due today, low stock, warranties ending soon, licenses ending soon, PCs missing details, and more)
- Filters that apply as you choose them and live in the address bar, on Inventory, Borrowing, Maintenance, Users, Hardware, Software, Labels, Reports, and the audit trail
- An audit trail that opens on the important changes, groups events by day, and keeps routine events (QR scans, label prints, report downloads, sign-ins) one click away
- Borrowing limits: reservations at most 3 days ahead, loans at most 7 days (14 with an extension), at most 3 open requests per student, no new requests while something is overdue, and missed pickups release the equipment automatically. See [the launch notes](docs/launch-checklist.md) for the exact rules and how to change them
- Two account types: **Administrator** and **Faculty staff**. Faculty staff can do everything except create or manage accounts
- A paper-and-ink "ledger" look with a serif for titles, a mono for asset tags, and light and dark themes; see [the design notes](docs/design-system.md)
- Public borrowing requests from QR codes, including future reservations in the same borrow form, staff approval, checkout (with an ID check), cancellation, and return tracking
- **Return reminders** and a **due today** list: staff copy a ready-written text for the borrower, and the dashboard and Borrowing page list what is due back today
- **Scanning a QR code**: a signed-in phone goes straight to the item's record for editing, with small shortcuts to borrow, return, or report a problem. Anyone else sees the item, whether it is available (clearly, before any form), and the borrow, return, and report forms
- QR issue reports (which ask for the reporter's name) routed to Maintenance, with a source filter, staff inspection, item history, and CSV/PDF exports
- Light protection on the public forms: each is signed to the item and the time it was opened, so scripts posting straight to the server, instant submissions, and pages left open for hours are refused, on top of the rate limits and staff approval
- Reservation pickup and return times in Philippine time, overlap protection, and report views for pending, reserved, borrowed, returned, and cancelled requests
- One-unit tagged assets remain quantity `1` while checked out and temporarily use the deployed status; returning them restores their prior available status
- Bulk retirement keeps a record and its history, while permanent deletion is deliberately blocked for records with borrowing or maintenance history
- Shared dashboard notes and a paginated activity history that records the responsible user
- Administrator account management, account deactivation, password reset, and unlocking accounts that were temporarily locked after repeated failed sign-ins
- Overdue loans are flagged in Borrowing and on the dashboard worklist, can be filtered, and staff can change a checked-out item's return time (availability is re-checked against other bookings)
- The public QR page lists when an item is already booked or in use (times only, never borrower details)
- CSV exports use Philippine time, matching the screens and PDF reports
- Optimistic inventory, borrowing, and maintenance changes with automatic rollback on failed saves, an instant progress bar when a link is pressed, and page-shaped placeholders while data loads
- Live dashboard and public QR updates across browser sessions, with reconnect and polling fallback

## Live updates and form behavior

Dashboard pages and public item pages subscribe to `/api/live` using server-sent events. The server checks database revisions every five seconds and scopes each dashboard subscription to the tables used by that page. Concurrent subscribers share an in-flight revision query and its result for two seconds after completion. A normal initial connection establishes a baseline without immediately loading the page again; subsequent changes refresh its data. Same-browser tabs also notify each other after a successful mutation. This works across application workers and with the existing PostgreSQL connection pool; no additional service, database migration, or Supabase Realtime configuration is required.

The feed returns opaque revision hashes. Dashboard subscriptions require an active staff session; public subscriptions are scoped to one QR code and never include borrower information. Streams rotate after about 25 seconds, reconnect automatically, and fall back to ten-second polling when streaming is unavailable. Background tabs stop subscribing until visible again. Preserve streaming and disable proxy buffering for `/api/live` where supported; polling still works when a proxy buffers the response.

Inventory edits and bulk changes, borrowing decisions, and maintenance status changes appear immediately with a saving indicator. New-record forms show a provisional preview. The server remains authoritative: failures restore the original display and retain the entered values. Remote refreshes wait while forms contain unsaved changes, and stale-record errors offer a way to refresh the surrounding details while keeping the draft. A once-per-minute reconciliation updates time-dependent reservation and overdue displays and catches changes between page rendering and subscription. Polling fallback also reconciles its first response after a delayed connection. These behaviors, offline recovery, and responsive layouts are covered by `tests/launch/live-updates.spec.ts`.

## Local setup

Install dependencies and create `.env.local` from the following template:

```env
DATABASE_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:6543/postgres?pgbouncer=true"

# Direct migration-owner connection. Prisma migration commands prefer this URL.
# DIRECT_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:5432/postgres"

# School-local runtime connection. The application prefers this URL when present.
# SCHOOL_DATABASE_URL="postgresql://..."

NEXT_PUBLIC_APP_URL="http://localhost:3000"
REQUEST_RATE_LIMIT_SECRET="at-least-32-random-characters"
BORROWER_DATA_RETENTION_DAYS="365"
```

Generate the client and apply the tracked migration:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

Then open **Settings** to add rooms and categories. Each setting receives a tag code; future equipment can leave the asset-tag field blank to generate the next compatible `INV-CAT-ST-ROOM-0001` tag and a unique QR code. Create one tracked-asset record per physical PC, TV, or other equipment unit; use a supply record only for shared quantity-based stock. Use **Print QR code** for each individual asset.

### Import rules

The importer takes CSV and `.xlsx` files as they come. The rules, in short (the Import page shows the same list):

- **Headings** are matched ignoring case, spaces, and punctuation, and many common names work (`Item`, `Equipment`, `Qty`, `Serial No.`, `Brand`, `Room`, `Price`, `Warranty`, `Property No.`, and older headings such as `inventory code` and `product info`). They can sit on any of the first 25 rows and in any order. With several sheets, the one that names the most fields is read. Only the item name is required.
- **Missing columns**: a missing category or location uses the default typed on the Import page, or "Uncategorized" and "Unassigned" if none is given (and the result says how many rows that affected). Everything else is simply left blank.
- **Extra columns**: a column whose heading matches one of your extra fields fills that field; any other column is kept in each item's notes (or ignored if you turn that off). The result lists which.
- **Rows**: empty rows, total rows, and repeated headings are skipped silently. A row with no item name is skipped and listed. Up to 1,000 rows are read per file; the rest are reported so they can go in a second file.
- **Values**: peso amounts such as `₱1,200`, sizes such as `8GB` or `1TB`, dates such as `1/15/2026` or `15 Jan 2026`, and words such as `broken`, `in use`, `consumable` are understood. A value that cannot be understood is left blank and listed as an adjustment; it never rejects the row.
- **Quantity**: equipment with a quantity above 1 becomes that many separate items, each with its own asset tag and QR code (up to 50 per row; a supplied tag, serial number, or MAC address belongs to one unit, so such a row must stay one per unit). Mark a row `stock` in the `type` column to keep it as one counted record with a `low stock level`.
- **Asset tags** that do not follow the `INV-CAT-ST-ROOM-0001` format are replaced by a generated tag, and the original is kept in the notes.
- **Problems** that cannot be adjusted (a repeated asset tag, serial number, or MAC address, an inactive category or room) skip that row with its row number while every other row imports. **Check file** finds all of them first without saving anything.

## QR codes in production

Set `NEXT_PUBLIC_APP_URL` in the production environment to the permanent public or school-LAN address before printing QR codes. This is always the preferred QR code destination. On Vercel, the app also falls back to Vercel's permanent production-domain variable when it is exposed, so QR codes created from a preview do not point at that preview deployment.

The public `/scan/[qrCode]` page must be reachable without Vercel Deployment Protection or Vercel Authentication. If Vercel shows its own sign-in page after scanning, make the production deployment public in Vercel and reprint the affected QR codes; a printed QR code permanently retains its embedded URL. Vercel documents its permanent production-domain variable and Deployment Protection behavior in its [system environment-variable documentation](https://vercel.com/docs/environment-variables/system-environment-variables) and [Deployment Protection guide](https://vercel.com/docs/deployment-protection).

Every printed QR code and QR code opening is recorded in the administrator-only Audit trail. Administrators can search, filter, inspect event metadata, and download the current filtered audit-trail CSV or PDF.

### Development account

The current development database contains an administrator account created for testing. Its credentials are intentionally not stored in this repository. Change its password or deactivate it from **Users** before sharing the app beyond development.

## Development with Supabase PostgreSQL

Keep `DATABASE_URL` set to the Supabase PostgreSQL connection string while developing and testing through Vercel. If the Supabase project uses a connection pooler, use its pooler URL for `DATABASE_URL` and its direct PostgreSQL URL for `DIRECT_URL` when running Prisma migrations. The application never uses `DIRECT_URL` at runtime.

The application does not use Supabase Storage or Supabase Auth. Prisma connects directly to the Supabase-hosted PostgreSQL database, so the same database code also works with an ordinary local PostgreSQL server.

## School-local PostgreSQL launch

1. Install PostgreSQL **15 or newer** on the school-managed server. The migration history uses a PostgreSQL 15 uniqueness feature.
2. Have the school DBA create the `ceit_inventory_migrator` and `ceit_inventory_app` roles before the first migration. The migration role owns database objects; the app role receives only runtime table and sequence access through the final migration.
3. Copy `.env.example` to `.env.local` on the school deployment server. Set `SCHOOL_DATABASE_URL` to the `ceit_inventory_app` connection, `DIRECT_URL` to the temporary `ceit_inventory_migrator` connection, and `REQUEST_RATE_LIMIT_SECRET` to a random value of at least 32 characters.
4. Run `npm run db:migrate:deploy` once, then remove `DIRECT_URL` from the application service environment. The migration config reads both `.env.local` and `.env`.
5. Create the first `ADMINISTRATOR` through the school's secured database-administration process. Serve production over HTTPS, including school-LAN deployments: sign-in cookies require a secure connection, and phone camera access requires a secure browser context. Set `NEXT_PUBLIC_APP_URL` to that permanent HTTPS address and print QR codes only after that.
6. Deploy the application where it can privately reach the school database. A hosted application service needs a secured network path to an on-campus database; otherwise host the application on the school's server or private network too.

See [the school PostgreSQL runbook](docs/school-postgresql.md) for role setup, backups, and restoration checks.

`DATABASE_URL`, `SCHOOL_DATABASE_URL`, `DIRECT_URL`, and `REQUEST_RATE_LIMIT_SECRET` are server-only secrets. Never commit any of them or user credentials. `DIRECT_URL` is optional and is only useful for a separate migration-owner connection.

## Production access control

The dashboard uses application accounts stored in PostgreSQL. Public QR pages allow students to request equipment, arrange returns, and report problems without an account. There are two staff roles: `ADMINISTRATOR`, shown as **Administrator**, and `STAFF`, shown as **Faculty staff**. Every staff action rechecks the signed-in role. Faculty staff can do everything the administrator can (inventory, borrowing, maintenance, reports, the audit trail, and setting up rooms and categories) except create, change, deactivate, or unlock accounts, which only administrators can do. Both roles can open Settings to change their own password. Sessions last 7 days.

Before any public deployment, replace or remove every temporary development account and verify that only school-approved administrators remain active.

## Safety and verification

Public borrowing, return, and issue reports are rate-limited using a hashed request fingerprint. Completed, declined, and cancelled requests retain operational history while the borrower's name, student number, contact number, and notes are redacted after their retention deadline. New requests set that deadline to the expected return time plus `BORROWER_DATA_RETENTION_DAYS` (365 days by default). Expired details are redacted automatically, at most every six hours, whenever staff open the dashboard, so hosting without a scheduler (such as Vercel) still honors the retention period. On a school server you can also schedule `npm run db:purge-borrower-data` daily.

Run `npm run test:unit` for fast logic tests, `npm run test:e2e` for public browser checks, `npm run test:db` against a configured database, and `npm run verify` before deployment. GitHub Actions runs the unit, browser, lint, type, and production-build checks on every push and pull request.

After deploying, set `CEIT_E2E_BASE_URL` to the public website URL and run
`npm run test:e2e` to test that deployment instead of starting a local server.
These public checks do not sign in or modify inventory data; appearance changes
are confined to the test browser. They include checks that the delivered CSS
matches the appearance controls, with usable targets and readable theme text.
Production builds bypass Turbopack's persisted compilation cache after a release
was observed serving old global CSS alongside updated components. Browser asset
caching and runtime data behavior are unchanged.

For authenticated workflow checks, run `npm run test:launch:setup`, then `npm run test:launch`. Setup applies every migration to a new `ceit_test_launch_*` schema and seeds temporary accounts and equipment. The suite only resets data inside that schema; it refuses to run against the normal inventory schema. It starts and stops a production server on port 3101. Temporary credentials stay in the ignored `.env.e2e.local`; screenshots and sample reports are in the ignored `test-results` directory. Use a development database with schema-creation permission. Do not run setup against the school production database.

After testing, run `npm run test:launch:cleanup` to preview removal, then add `-- --apply` to remove that test schema and its local credentials. Run `npm run build` afterward to restore the normal application build.

See [the launch checklist and workflow notes](docs/launch-checklist.md) for rollout, reservation rules, print settings, and database pool sizing.
