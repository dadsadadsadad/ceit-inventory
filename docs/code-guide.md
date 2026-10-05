# Code guide

- `src/app/dashboard/`: staff pages. Each section keeps its form actions in `actions.ts` (Inventory uses an `actions/` folder with `item`, `bulk`, `photos`, and `computer` modules plus shared input readers). Large pages are split into a query module (filters and `where` clauses), and small components next to the page or in `_components/`.
- `src/proxy.ts`: a first sign-in check for staff pages. Pages, downloads, and actions still verify the session themselves.
- `src/app/scan/`: public QR pages, borrowing, returns, and issue reports.
- `src/app/components/`: shared controls.
- `src/lib/`: shared validation, permissions, dates, and inventory rules. Small shared helpers live here too: `ids.ts` (UUID check), `search-params.ts` (query-string readers), `pagination.ts` plus `components/pager.tsx` (every pager), `form-fields.ts` (server-action text readers), `labels.ts` (readable enum names), and `search-terms.ts` (multi-word search).
- `src/lib/reports/`: CSV formatting, PDF layouts, and export logging. Each PDF report has its own file under `pdf/`.
- `src/lib/appearance.ts`: color conversion and contrast. `appearance-bootstrap.ts` restores saved colors before the page renders.
- `src/prisma.ts`: the shared database client. `src/lib/database-transaction.ts` retries conflicting writes.
- `prisma/schema.prisma`: tables, relations, and indexes. Add a migration for schema changes; keep applied migrations intact.
- `scripts/`: database checks, maintenance, and test setup.
- `tests/unit/`: logic tests. `tests/e2e/` covers public pages; `tests/launch/` covers staff workflows in a separate schema.

Use plain names that describe the data or action. Add a short comment when a block needs context. Let Prettier handle spacing and wrapping.

```bash
npm run format
npm run format:check
npm run test:unit
npm run verify
```

Database maintenance starts with a preview:

```bash
npm run db:maintenance
npm run db:maintenance -- --apply
```

Apply removes expired sessions and request-limit entries older than 24 hours. Inventory, borrowing history, maintenance, and audit records stay intact. The output also lists integrity checks and leftover test schemas; it does not drop schemas.
