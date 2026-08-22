# School PostgreSQL runbook

Use PostgreSQL 15 or newer. The application uses PostgreSQL directly; it does not require Supabase services after handover.

## First-time setup

Run the following as a school database administrator. Replace both passwords with long unique secrets and keep them in the school's secret manager.

```sql
CREATE ROLE ceit_inventory_migrator LOGIN PASSWORD 'replace-with-migration-secret';
CREATE ROLE ceit_inventory_app LOGIN PASSWORD 'replace-with-runtime-secret';
CREATE DATABASE ceit_inventory OWNER ceit_inventory_migrator;
GRANT CONNECT ON DATABASE ceit_inventory TO ceit_inventory_app;
```

Set `DIRECT_URL` to the migration role and `SCHOOL_DATABASE_URL` to the app role in `.env.local`. Run:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:check
```

The last migration grants the app role only schema, table, and sequence access, and adds an RLS policy exclusively for that role. Do not run the web application with the migration account.

## Routine operation

Run this daily through the school's task scheduler or cron service:

```bash
npm run db:purge-borrower-data
```

Back up PostgreSQL daily with `pg_dump` from a protected school server. Store encrypted backups separately, test a restoration to a non-production database each term, and record the restore time and result.

Before an application update, back up the database, run `npm run verify`, run `npm run db:migrate:deploy` with the migration role, then restart the application service using only `SCHOOL_DATABASE_URL`.
