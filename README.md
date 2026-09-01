# CEIT Inventory

Inventory management for CEIT rooms, equipment, PCs, supplies, and QR-labeled assets. During development, the application uses Supabase PostgreSQL. When the school launches it, the same code can move to the school's own PostgreSQL server without an application rewrite.

## What is included

- Room and location management
- Item categories, individually tracked assets, and quantity-based supply records
- Per-PC/Mac hardware and software descriptions, structured technical details, and installed-software records
- Automatic asset tags in the existing `INV-CAT-ST-ROOM-0001` format and a unique QR code for every new equipment record
- Item-wide last-checked dates, including a one-click inspection record
- Item status, condition, and location updates with an audit history
- Printable QR labels that open a mobile-friendly item screen
- Phone camera scanning with a cross-browser decoder and a manual-code fallback
- Search, filters, sorting, and page navigation for status, room, identifiers, category, type, and condition
- CSV/XLSX import with flexible column headings and row-level feedback
- Filterable inventory, PC/Mac register, borrowing, service, and audit CSV exports, plus printable overview and PC/Mac-register PDFs
- Public borrowing requests from QR labels, with staff approval, return, and history tracking
- Shared dashboard notes and a paginated activity history that records the responsible user
- Administrator account management, account deactivation, and password reset

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

Then open **Settings** to add rooms and categories. Each setting receives a tag code; future equipment can leave the asset-tag field blank to generate the next compatible `INV-CAT-ST-ROOM-0001` tag and a unique QR code. Create one tracked-asset record per physical PC, TV, or other equipment unit; use a supply record only for shared quantity-based stock. Use **Print QR label** for each individual asset.

## QR labels in production

Set `NEXT_PUBLIC_APP_URL` in the production environment to the permanent public or school-LAN address before printing labels. This is always the preferred QR destination. On Vercel, the app also falls back to Vercel's permanent production-domain variable when it is exposed, so labels created from a preview do not point at that preview deployment.

The public `/scan/[qrCode]` page must be reachable without Vercel Deployment Protection or Vercel Authentication. If Vercel shows its own sign-in page after scanning, make the production deployment public in Vercel and reprint the affected labels; a printed QR code permanently retains its embedded URL. Vercel documents its permanent production-domain variable and Deployment Protection behavior in its [system environment-variable documentation](https://vercel.com/docs/environment-variables/system-environment-variables) and [Deployment Protection guide](https://vercel.com/docs/deployment-protection).

Every label print and QR opening is recorded in the administrator-only Audit trail. Administrators can search, filter, inspect event metadata, and download the current filtered audit-trail CSV.

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
5. Create the first `ADMINISTRATOR` through the school's secured database-administration process, set `NEXT_PUBLIC_APP_URL` to the school-managed public URL (use HTTPS when available; trusted LAN deployments may use HTTP), and print QR labels only after that.
6. Deploy the application where it can privately reach the school database. A hosted application service needs a secured network path to an on-campus database; otherwise host the application on the school's server or private network too.

See [the school PostgreSQL runbook](docs/school-postgresql.md) for role setup, backups, and restoration checks.

`DATABASE_URL`, `SCHOOL_DATABASE_URL`, `DIRECT_URL`, and `REQUEST_RATE_LIMIT_SECRET` are server-only secrets. Never commit any of them or user credentials. `DIRECT_URL` is optional and is only useful for a separate migration-owner connection.

## Production access control

The dashboard and QR scan flow use application accounts stored in PostgreSQL. Every inventory-changing server action rechecks the signed-in role, so a QR label identifies an item but does not grant permission to edit it. `ADMINISTRATOR` and `STAFF` accounts can make changes; `VIEWER` accounts are read-only.

Before any public deployment, replace or remove every temporary development account and verify that only school-approved administrators remain active.

## Safety and verification

Public borrowing and return requests are rate-limited using a hashed request fingerprint. Completed or declined requests retain operational history while the borrower's name, student number, contact number, and notes are redacted after `BORROWER_DATA_RETENTION_DAYS` (365 days by default). Schedule `npm run db:purge-borrower-data` daily on the school server.

Run `npm run test:unit` for fast logic tests, `npm run test:e2e` for public browser checks, `npm run test:db` against a configured database, and `npm run verify` before deployment. GitHub Actions runs the unit, browser, lint, type, and production-build checks on every push and pull request.
