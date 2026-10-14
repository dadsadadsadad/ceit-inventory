# Code guide

## Folders

- `src/app/dashboard/` - staff pages. Form actions are in `actions.ts` (inventory has an `actions/` folder). Bigger pages have a `*-query.ts` for filters and small components in `_components/`.
- `src/app/scan/` - public qr pages (borrow, return, report a problem).
- `src/app/components/` - shared components.
- `src/app/styles/` - css, loaded in this order: `tokens.css`, `base.css`, `shell.css`, `components.css`, `pages.css`, `views.css`, `preferences.css`.
- `src/lib/` - shared logic (auth, dates, borrowing rules, validation, search).
- `src/lib/reports/` - reports. `kinds.ts` lists them, `builders/` has one file per report, and the page, pdf (`pdf/render.ts`) and csv all render the same `ReportModel`.
- `src/proxy.ts` - redirects signed out users away from staff pages. Pages and actions still check the session.
- `src/prisma.ts` - db client. `src/lib/database-transaction.ts` retries serializable transactions.
- `prisma/` - schema and migrations. Don't edit migrations that already ran.
- `scripts/` - db checks, maintenance and test setup.
- `tests/unit/` - vitest. `tests/e2e/` - public pages. `tests/launch/` - staff workflows on a separate test schema.

## Commands

```bash
npm run format
npm run format:check
npm run test:unit
npm run verify
```

## DB maintenance

```bash
npm run db:maintenance
npm run db:maintenance -- --apply
```

Without `--apply` it only prints what it would do. With it, it deletes expired sessions and old rate limit rows. It never touches inventory, borrowing, maintenance or audit data, and doesn't drop test schemas.
