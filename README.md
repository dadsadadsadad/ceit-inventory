# CEIT Inventory

Inventory management for CEIT rooms, equipment, PCs, supplies, and assets with QR codes. During development, the application uses Supabase PostgreSQL. When the school launches it, the same code can move to the school's own PostgreSQL server without an application rewrite.

See [the code guide](docs/code-guide.md) for the folder layout, formatting commands, and database maintenance.

## What is included

- Room and location management
- Item categories, individually tracked assets, and quantity-based supply records
- Per-PC/Mac hardware and software descriptions, structured technical details, and installed-software records
- Automatic asset tags in the existing `INV-CAT-ST-ROOM-0001` format and a unique QR code for every new equipment record
- Item-wide last-checked dates, including a one-click inspection record
- Item status, condition, and location updates with an audit history
- Individual QR labels and A4 label sheets for selected items or a room (24 compact or 8 large labels per sheet)
- Phone camera scanning with a cross-browser decoder and a manual-code fallback
- Multi-word search (every word must match, across name, tag, serial, room, MAC/IP, and more), filters, sorting, and page navigation for status, room, category, type, condition, items that need attention, and items not checked in 90+ days
- Bulk status, condition, location, and inspection changes for selected items, including **Record inspection** for a whole room
- CSV/XLSX import with flexible column headings and row-level feedback. **Validate before importing** checks every row against Settings (missing or inactive categories and rooms) and against records that already exist (asset tags, serial numbers, MAC addresses), so a clean preview matches what the real import will do
- **Hardware and Software views** next to the Inventory list: every processor, memory size, storage, graphics part, operating system, and installed program, grouped, searchable, and showing which PCs have it, with license expiry for software
- **Reports** you generate on the page first and then download as a PDF or CSV: overview, inventory, PC register, hardware, software, borrowing, maintenance, and audit trail, each with its own filters and a set of one-click quick reports (overdue loans, licenses ending soon, PCs missing details, and more)
- Filters that apply as you choose them and live in the address bar, on Inventory, Borrowing, Maintenance, Users, Hardware, Software, Labels, Reports, and the audit trail
- An audit trail that opens on the important changes, groups events by day, and keeps routine events (QR scans, label prints, report downloads, sign-ins) one click away
- Borrowing limits: reservations at most 3 days ahead, loans at most 7 days (14 with an extension), at most 3 open requests per student, no new requests while something is overdue, and missed pickups release the equipment automatically. See [the launch notes](docs/launch-checklist.md) for the exact rules and how to change them
- Two account types: **Administrator** and **Faculty staff**. Faculty staff can do everything except create or manage accounts
- A paper-and-ink "ledger" look with a serif for titles, a mono for asset tags, and light and dark themes; see [the design notes](docs/design-system.md)
- Public borrowing requests from QR codes, including future reservations in the same borrow form, staff approval, checkout, cancellation, and return tracking
- QR issue reports routed to Maintenance, with a source filter, staff inspection, item history, and CSV/PDF exports
- Reservation pickup and return times in Philippine time, overlap protection, and report views for pending, reserved, borrowed, returned, and cancelled requests
- One-unit tagged assets remain quantity `1` while checked out and temporarily use the deployed status; returning them restores their prior available status
- Bulk retirement keeps a record and its history, while permanent deletion is deliberately blocked for records with borrowing or maintenance history
- Shared dashboard notes and a paginated activity history that records the responsible user
- Administrator account management, account deactivation, password reset, and unlocking accounts that were temporarily locked after repeated failed sign-ins
- Overdue loans are flagged in Borrowing and on the dashboard worklist, can be filtered, and staff can change a checked-out item's return time (availability is re-checked against other bookings)
- The public QR page lists when an item is already booked or in use (times only, never borrower details)
- Quick navigation (Ctrl/Cmd + K) supports arrow keys and Enter, and finds equipment by name, tag, serial, or room
- CSV exports use Philippine time, matching the screens and PDF reports
- Optimistic inventory, borrowing, and maintenance changes with automatic rollback on failed saves
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

The importer accepts CSV and `.xlsx` files with flexible header aliases: spaces, underscores, capitalization, and legacy headings such as `inventory code`, `product info`, and `last date checked` are recognized. It needs a name, category, and either a location/room column or a chosen default location. Use **Validate before importing** first; it writes nothing and reports row-level problems.

For individually tracked equipment, each physical unit must be a separate `asset` row with `quantity` set to `1`. This lets the system generate or validate one unique asset tag and one unique QR code per row. A row such as `TV, asset, quantity 4` is deliberately skipped rather than silently creating four ambiguous QR codes: add four rows, including each unit's room, serial number, and any supplied tag when those differ. PCs and Macs always follow this one-row-per-device rule.

For shared stock, use `type` `supply`; one row may have `quantity` `4`, but it is one stock record with one QR code, not four individually tagged items. Invalid rows, duplicate asset tags/serial numbers/MAC addresses, inactive setup records, and unsupported values are skipped with a row number while valid rows in the same file continue to import. Missing categories and locations can be created during import when that option is enabled.

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
