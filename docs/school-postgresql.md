# School PostgreSQL setup

Needs PostgreSQL 15+. Supabase isn't needed once it's on the school server.

## First time

Run as a db admin (change both passwords):

```sql
CREATE ROLE ceit_inventory_migrator LOGIN PASSWORD 'replace-with-migration-secret';
CREATE ROLE ceit_inventory_app LOGIN PASSWORD 'replace-with-runtime-secret';
CREATE DATABASE ceit_inventory OWNER ceit_inventory_migrator;
GRANT CONNECT ON DATABASE ceit_inventory TO ceit_inventory_app;
```

In `.env.local` set `DIRECT_URL` to the migrator role and `SCHOOL_DATABASE_URL` to the app role, then:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:check
```

The migrations only give the app role table and sequence access. Don't run the app with the migrator account.

## Day to day

Run this daily with cron or Task Scheduler:

```bash
npm run db:purge-borrower-data
```

Back up daily with `pg_dump`, keep the backups encrypted somewhere else, and test a restore at least once a term.

To update: back up, run `npm run verify`, run `npm run db:migrate:deploy` with the migrator role, then restart the app with only `SCHOOL_DATABASE_URL` set.
