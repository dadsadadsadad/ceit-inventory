# CEIT Inventory

QR code based inventory and asset tracking for the CEIT department's labs and equipment. Next.js + Prisma + PostgreSQL. Uses Supabase during development and can be moved to the school's own PostgreSQL server.

Folder layout and commands are in [docs/code-guide.md](docs/code-guide.md).

## Features

- rooms, categories, equipment (one record and qr code per unit) and stock with low stock alerts
- asset tags generated as `CATEGORY-ROOM-0001`, e.g. `ROBOT-MIKRO-0001`
- pc profiles (hardware, software, licenses) and hardware/software views across all pcs
- warranty dates, inspection dates and custom fields
- qr label printing, single or in batches on A4
- scanning with a phone camera. staff go to the edit page, students can borrow, return or report a problem
- borrowing requests, reservations, checkout, returns, overdue tracking and reminders
- maintenance tickets
- csv/xlsx import with a check mode that doesn't save
- reports on the page or as pdf/csv, with charts and filters
- audit trail
- admin and faculty staff accounts
- light/dark theme and a few appearance options
- live updates between open tabs

## Setup

Create `.env.local` (see `.env.example`):

```env
DATABASE_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:6543/postgres?pgbouncer=true"
# DIRECT_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:5432/postgres"
# SCHOOL_DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
REQUEST_RATE_LIMIT_SECRET="at-least-32-random-characters"
BORROWER_DATA_RETENTION_DAYS="365"
```

Then:

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

On a new database, create the first admin account. It prints a temporary password, change it in **Settings** after signing in:

```bash
npm run db:create-admin -- admin admin@example.com
```

Then add rooms and categories in **Inventory > Rooms and categories**.

`DIRECT_URL` is only for migrations. If `SCHOOL_DATABASE_URL` is set it's used instead of `DATABASE_URL`. Don't commit any of these.

## Importing

CSV and `.xlsx` both work. Columns can be in any order and common names are recognized (`Item`, `Qty`, `Serial No.`, `Room`, `Price`, etc). Only the item name is required. Missing category/room use defaults, unknown columns go into the notes, and unreadable values are left blank with a warning. **Check file** shows the result without saving.

## QR codes

Set `NEXT_PUBLIC_APP_URL` to the real public address before printing labels, since the url is baked into each code. `/scan/[qrCode]` has to be reachable without Vercel Deployment Protection.

## Moving to the school server

1. Install PostgreSQL 15+.
2. Create the `ceit_inventory_migrator` and `ceit_inventory_app` roles.
3. Set `SCHOOL_DATABASE_URL` (app role) and `DIRECT_URL` (migrator role).
4. Run `npm run db:migrate:deploy`, then remove `DIRECT_URL` from the app's env.
5. Run `npm run db:create-admin -- <username> <email>` for the first account.
6. Serve it over https (needed for cookies and the phone camera).

Details in [docs/school-postgresql.md](docs/school-postgresql.md). Release steps and borrowing rules are in [docs/launch-checklist.md](docs/launch-checklist.md).

## Accounts

Admins can do everything. Faculty staff can do everything except manage accounts. Students don't need an account to use the qr pages. Sessions last 7 days.

## Borrower data

Public forms are rate limited. Borrower names, student numbers and contact numbers are removed from finished requests after `BORROWER_DATA_RETENTION_DAYS`. This runs when staff open the dashboard, or with `npm run db:purge-borrower-data`.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run verify
```

For the signed in workflow tests run `npm run test:launch:setup` then `npm run test:launch`. They use a separate `ceit_test_launch_*` schema. Clean up with `npm run test:launch:cleanup -- --apply` and run `npm run build` again after.
