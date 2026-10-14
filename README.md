# CEIT Inventory

QR code-based inventory and asset tracking for the CEIT department's rooms, computer labs, equipment, and supplies. Built with Next.js, Prisma, and PostgreSQL. It runs on Supabase PostgreSQL during development and can move to the school's own PostgreSQL server without code changes.

See [the code guide](docs/code-guide.md) for the folder layout and common commands.

## Features

- Rooms, categories, tracked equipment (one record, asset tag, and QR code per unit), and counted stock with low-stock alerts
- Automatic asset tags in the `INV-CAT-ST-ROOM-0001` format and a QR code for every item
- PC and Mac profiles with hardware, software, and license details, plus Hardware and Software views across all PCs
- Warranty dates, last-checked dates, and custom fields that staff can add from Settings or any item form
- QR label printing, one at a time or in batches on A4 sheets
- Phone camera scanning. Staff go straight to the item record; students see the item and can borrow it, return it, or report a problem
- Borrowing requests, reservations, checkout, returns, overdue tracking, and return reminders
- Maintenance tickets from staff and from QR issue reports
- CSV and XLSX import with a dry-run check
- Reports on the page, as PDF, or as CSV, with charts and filters
- An audit trail of who changed what
- Administrator and Faculty staff accounts
- Light and dark themes with a few appearance options
- Live updates across open browser tabs

## Local setup

Create `.env.local` (see `.env.example`):

```env
DATABASE_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:6543/postgres?pgbouncer=true"
# DIRECT_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:5432/postgres"
# SCHOOL_DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
REQUEST_RATE_LIMIT_SECRET="at-least-32-random-characters"
BORROWER_DATA_RETENTION_DAYS="365"
```

Then run:

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

Open **Settings** to add rooms and categories before adding items.

`DIRECT_URL` is only used by Prisma migrations. `SCHOOL_DATABASE_URL` is used instead of `DATABASE_URL` when it is set. Never commit any of these values.

## Importing items

The importer accepts CSV and `.xlsx` files. Column headings can be in any order and use common names (`Item`, `Qty`, `Serial No.`, `Room`, `Price`, and so on). Only the item name is required. Missing categories and rooms fall back to defaults, unknown columns go into the item notes, and values that cannot be read are left blank and listed. **Check file** shows what would happen without saving anything.

## QR codes in production

Set `NEXT_PUBLIC_APP_URL` to the permanent public address before printing labels, because a printed QR code keeps its URL. The `/scan/[qrCode]` pages must be reachable without Vercel Deployment Protection.

## Moving to the school server

1. Install PostgreSQL 15 or newer.
2. Create the `ceit_inventory_migrator` and `ceit_inventory_app` roles.
3. Set `SCHOOL_DATABASE_URL` to the app role and `DIRECT_URL` to the migrator role.
4. Run `npm run db:migrate:deploy`, then remove `DIRECT_URL` from the app environment.
5. Serve the app over HTTPS (needed for sign-in cookies and phone cameras).

The full steps, including backups, are in [the school PostgreSQL runbook](docs/school-postgresql.md). Release steps and borrowing rules are in [the launch checklist](docs/launch-checklist.md).

## Accounts

Administrators can do everything. Faculty staff can do everything except manage accounts. Students do not need an account to borrow, return, or report a problem from a QR page. Sessions last 7 days.

## Borrower data

Public forms are rate limited. Borrower names, student numbers, and contact details are removed from finished requests after `BORROWER_DATA_RETENTION_DAYS`. This runs automatically when staff open the dashboard, or on a schedule with `npm run db:purge-borrower-data`.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run verify
```

`npm run test:launch:setup` followed by `npm run test:launch` runs the signed-in workflow tests against a separate `ceit_test_launch_*` schema. Remove it afterwards with `npm run test:launch:cleanup -- --apply`, then run `npm run build` again.
