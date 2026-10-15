# Launch notes

## Before a release

1. Back up the database and check the backup restores.
2. Run `npm ci`, `npm run test:unit`, `npm run test:e2e` and `npm run verify`.
3. On a dev database run `npm run test:launch:setup` then `npm run test:launch`.
4. Run `npm run db:migrate:deploy` with the migration connection, then `npm run test:db`. Migrations go in **before** the code that needs them. After that, `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` should print nothing.
5. Set `NEXT_PUBLIC_APP_URL` (https), `REQUEST_RATE_LIMIT_SECRET` and the retention period, then build with the production env. Don't reuse a test build.
6. Replace any temporary admin accounts and set up backups.
7. Scan a printed label with a phone on the school network and print one test sheet at 100% before printing a batch.

`vercel.json` pins functions to Singapore (`sin1`) because the database is there. If the database moves, change the region too, otherwise every query crosses regions and pages get slow.

## Borrowing rules

Defaults are in `src/lib/borrow-policy.ts` and can be changed with env vars (see `.env.example`).

| Rule                                         | Default  | Variable                     |
| -------------------------------------------- | -------- | ---------------------------- |
| How far ahead a reservation can start        | 3 days   | `BORROW_MAX_ADVANCE_DAYS`    |
| Max loan length                              | 7 days   | `BORROW_MAX_LOAN_DAYS`       |
| Max loan length with extensions              | 14 days  | `BORROW_MAX_TOTAL_LOAN_DAYS` |
| Open requests per student number             | 3        | `BORROW_MAX_ACTIVE_REQUESTS` |
| Uncollected reservation expires after        | 2 hours  | `BORROW_PICKUP_GRACE_HOURS`  |
| Unhandled "borrow now" request expires after | 24 hours | `BORROW_PENDING_HOLD_HOURS`  |

Students with something overdue can't make new requests until staff confirm the return. Expired requests show as **Pickup missed** or **Not handled in time** and stop blocking other bookings. The server checks all of this, not just the form.

### How it works

- On the qr page students pick **Borrow now** or **Reserve for later**. Times are Philippine time.
- Pending requests and reservations hold their time slot. Overlapping requests can't overbook a unit.
- Approving only reserves the time. Staff check the item out at pickup, and availability is checked again then.
- Overdue loans stay unavailable until staff confirm the return. They show an **Overdue** badge, appear on the dashboard and can be filtered.
- Staff can change the return time on a loan. Extending is blocked if it would overlap another booking.
- Tracked assets stay at quantity 1 and switch to Deployed while out.
- A return request from a student doesn't free the item. Staff inspect it and confirm.

## Stock, warranty and custom fields

- Low stock only applies to stock records. "Running low" means quantity at or below the alert level (default 5, 0 turns it off). Retired and lost records never alert.
- Warranty "ending soon" means within 60 days.
- Custom fields are set up in Settings and can be limited to one item type or category. Hiding a field keeps its answers.
- Adding equipment with a quantity creates that many units (max 50), each with its own tag and qr code.

## Reminders

- **Due today** lists loans due later today that aren't late yet.
- **Remind the borrower** gives a message to copy and send. It only mentions the item.
- Checkout asks staff to confirm they checked the borrower's id.

## Scanning

- Signed in staff go straight to the item's edit page, with shortcuts to borrow, return or report.
- Everyone else sees whether the item is available first, then the details and forms.
- Public forms carry a signed token. Forms posted without one, submitted instantly, or left open for 6+ hours are refused.

## Label printing

Pick items in Inventory and click **Print QR labels**, or choose a room on the labels page. Max 100 per batch.

Print on A4 at 100% scale with headers/footers off. Compact labels are 62 x 32 mm (3 x 8), large are 92 x 64 mm (2 x 4), with 10 mm margins. Long names get cut off, use the large size if needed.

## Limits

| Where            | Limit                                                  |
| ---------------- | ------------------------------------------------------ |
| Sign in          | 5 wrong passwords locks the account for ~15 min        |
| Sessions         | 7 days, max 5 devices per account                      |
| Public forms     | 8 per device and 60 per ip every 15 min, per form type |
| Borrower details | removed after the retention period (365 days default)  |
| Reports          | page shows 500 rows, pdf up to 2,000, csv up to 10,000 |
| Imports          | 10 MB and 1,000 rows per file                          |
| New units        | 50 at once                                             |
| Custom fields    | 40 fields, 500 characters per answer                   |
| Photos           | 4 per item, 3 MB each                                  |
| QR labels        | 100 per batch                                          |
| Bulk changes     | 10,000 records                                         |

## Database connections

`DB_POOL_MAX` defaults to 5 (1-20). Keep the total across all running instances, scripts and test servers under the database's connection limit. On serverless, use the pooler url at runtime and a separate direct url for migrations.

Live updates poll the database every 5 seconds per open page and share results for 2 seconds. Test `/api/live` behind the real proxy, including reconnecting and the polling fallback.

## Security notes

- Every staff page, download and action checks the session against the database. `src/proxy.ts` is only a first check.
- Passwords use scrypt. 5 failed attempts lock an account for 15 min, and 30 failures from one ip in 15 min block that ip. Wrong password, locked account and unknown user all get the same error.
- A browser that signed in before can still sign in while the account is locked, so nobody can lock the owner out on purpose.
- Public forms are rate limited and every request still needs staff approval. Borrowing rules run in a serializable transaction.
- All queries go through prisma. CSV exports escape formulas. Photos are checked by type and file signature and only served to staff.
- Row level security is on for every table.
- Security headers (CSP, frame options, nosniff, HSTS, referrer policy) are set in `next.config.ts`. The session cookie is HttpOnly, SameSite=Lax and Secure in production.
- The CSP still allows inline scripts because next needs them. Rate limits trust the ip from Vercel, so behind another proxy make sure it sets `X-Forwarded-For`.

## Test cleanup

The launch tests write the test schema and credentials to `.env.e2e.local`. Never copy it to production. The test build uses the test url, so run `npm run build` again afterwards.

To clean up, run `npm run test:launch:cleanup -- --apply`, or drop the `ceit_test_launch_*` schema by hand and delete `.env.e2e.local`.
