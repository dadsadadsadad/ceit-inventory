# CEIT Inventory

Inventory management for CEIT rooms, equipment, PCs, supplies, and QR-labeled assets. During development, the application uses Supabase PostgreSQL. When the school launches it, the same code can move to the school's own PostgreSQL server without an application rewrite.

## What is included

- Room and location management
- Item categories, tracked assets, and quantity-based supply records
- PC hardware details and installed-software records
- Item status, condition, and location updates with an audit history
- Printable QR labels that open a mobile-friendly item screen
- Phone camera scanning with a cross-browser decoder and a manual-code fallback
- Search, filters, sorting, and page navigation for status, room, identifiers, category, type, and condition
- CSV/XLSX import with flexible column headings and row-level feedback
- Public borrowing requests from QR labels, with staff approval, return, and history tracking
- Shared dashboard notes and a paginated activity history that records the responsible user
- Administrator account management, account deactivation, and password reset

## Local setup

Install dependencies and create `.env.local` from the following template:

```env
DATABASE_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:6543/postgres?pgbouncer=true"

# Optional direct Supabase connection for Prisma migrations.
# DIRECT_URL="postgresql://USER:PASSWORD@SUPABASE_HOST:5432/postgres"

# Optional school-local PostgreSQL override. It takes priority when present.
# SCHOOL_DATABASE_URL="postgresql://..."

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Generate the client and apply the tracked migration:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

Then open **Settings** to add rooms and categories, create inventory records, and use **Print QR label** for each tracked PC or asset.

### Development account

The current development database contains an administrator account created for testing. Its credentials are intentionally not stored in this repository. Change its password or deactivate it from **Users** before sharing the app beyond development.

## Development with Supabase PostgreSQL

Keep `DATABASE_URL` set to the Supabase PostgreSQL connection string while developing and testing through Vercel. If the Supabase project uses a connection pooler, use its pooler URL for `DATABASE_URL` and its direct PostgreSQL URL for `DIRECT_URL` when running Prisma migrations.

The application does not use Supabase Storage or Supabase Auth. Prisma connects directly to the Supabase-hosted PostgreSQL database, so the same database code also works with an ordinary local PostgreSQL server.

## School-local PostgreSQL launch

1. Install PostgreSQL on the school-managed server and create a dedicated database plus a least-privileged application user.
2. Copy `.env.example` to `.env.local` on the school deployment server. Set `SCHOOL_DATABASE_URL` to the school's PostgreSQL connection string; it takes priority over the temporary Supabase `DATABASE_URL` automatically.
3. Run `npm run db:migrate:deploy` once against the school database, then create the first `ADMINISTRATOR` through the school's secured database-administration process.
4. Set `NEXT_PUBLIC_APP_URL` to the school-managed application URL before printing production QR labels.
5. Deploy the application where it can privately reach the school database. A hosted application service needs a secured network path to an on-campus database; otherwise host the application on the school's server or private network too.

`DATABASE_URL`, `SCHOOL_DATABASE_URL`, and `DIRECT_URL` are server-only secrets. Never commit any of them or user credentials. `DIRECT_URL` is optional and is only useful when a provider uses a separate connection pooler for normal application traffic.

## Production access control

The dashboard and QR scan flow use application accounts stored in PostgreSQL. Every inventory-changing server action rechecks the signed-in role, so a QR label identifies an item but does not grant permission to edit it. `ADMINISTRATOR`, `CUSTODIAN`, and `STAFF` accounts can make changes; `VIEWER` accounts are read-only.

Before any public deployment, replace or remove every temporary development account and verify that only school-approved administrators remain active.
