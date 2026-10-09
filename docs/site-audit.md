# Website audit, fourth pass — full check and polish, 9 October 2026

Every page was looked at again with realistic data at desktop, phone (390 and 320 pixels wide),
and dark mode, and every server action and route was read for holes.

**Fixed: things that were wrong.**

- Changing an item's "Last checked" date on its edit form did not update its PC profile, so a PC
  showed two different inspection dates. The two now stay in step, and the PC card no longer
  repeats the date.
- On the dashboard, a long calendar pushed the recent activity far below the worklist, leaving a
  large empty gap. Account and sign-in events in the activity lists showed the stored
  "username | email" label; they now show the person's name.
- The inventory table gave the asset tag column the space meant for item names, so names and
  rooms wrapped mid-word. Columns now size to what they hold.
- Optional sections on the add and edit forms wrapped their headings unevenly in narrow panels,
  and stacked fields on the edit form had uneven gaps.
- The borrowing list put finished history first. It now shows requests and returns waiting on
  staff, then loans and reservations in progress, then history.
- Long report figures such as acquisition value broke across lines.
- The scanned-item choices ignored their left alignment, and the condition on the public item page
  was formatted with the status helper.
- Splitting a grouped asset did not copy its warranty or extra details to the new units.

**Fixed: holes.**

- Public forms counted their limit per device, which a script could reset by changing its browser
  name. A looser limit per network address now applies as well.
- Five wrong passwords lock an account, so anyone who knew a username could keep its owner out. A
  browser the owner has signed in on before can still sign in with the right password, and wrong
  current passwords on the Settings page count toward the same lock.
- Live updates no longer keep a connection open for a QR code that matches no item.
- Opening one QR page many times at once could write many scan records; the check and the write
  now happen together. The same is true for the photo limit, the calendar's daily limit, the
  extra-field limit, and the borrowing check when splitting grouped equipment.
- A malformed form signature could cause a server error instead of a message. A missing room or
  category, or a room without an asset-tag code, now gives a clear message.
- A return requested by mistake (or by someone else) could not be undone; staff can now keep the
  loan open with a new return time. Retired stock can no longer have its count changed.

**Polish.** A personal greeting with what is waiting; a framed scanner with steps beside it; calm
empty states instead of warning boxes; a not-found page that keeps the sidebar; show-password
buttons on every password field; styled file pickers; two-up filters and facts on phones; staff
notes shown on maintenance cards; consistent "Room" wording, back links, and clear-filter links.
Password boxes are named by their label alone, with the hint read as a description.

**Verification.** Format, ESLint, and TypeScript checks pass; 235 unit tests pass; the launch
suite (103 browser tests, including new ones for the lock, borrowing order, keeping a loan open,
live updates, and the not-found page) passes against a fresh database built from all 28
migrations; production dependencies report no known vulnerabilities. **No database change** is
needed for this version.

# Website audit, third pass — security, calendar, appearance

A review of how the site can be broken or misused, plus the dashboard calendar and a richer
Appearance panel.

**Security review.** Every server action, route, and page was checked for who may call it, what
it accepts, and what it trusts. Every staff action checks the signed-in account; the three public
actions are rate limited, signed to the item, and still need staff approval. Database access is
through bound values everywhere (the only raw SQL uses fixed table names), text is shown as text,
CSV exports defuse spreadsheet formulas, and photos are checked by signature. What was found and
fixed:

- **Row level security was missing on the extra-fields table.** Every other table already blocked
  the public database API; the table added in the last release did not. The new migration turns it
  on (and on the new calendar table).
- **Guessing passwords across many usernames was not slowed down.** Only each account locked. A
  device that fails 30 sign-ins in 15 minutes is now turned away before any password is checked.
- **The sign-in page revealed which usernames exist**, because a locked account got a different
  message. A wrong password, a locked account, and an unknown account now all get the same answer.
- **A null byte in a search box or form** (typed into an address by hand, or sent by a script) made
  the page's database query fail. Control characters are now removed where text arrives.
- **Next.js 16.3.4 had a published remote-code-execution advisory** (in an image feature this app
  does not use). Updated to 16.3.8, along with three smaller dependencies. Production dependencies
  report no known vulnerabilities.
- **Smaller hardening.** Opening a public QR page is recorded at most every five minutes per item
  instead of every fifteen seconds, one import can create at most 2,000 records, and the site now
  sends HSTS and a same-origin resource policy.

Checked and found sound, now with tests: borrowing equipment that is still out (refused even when
the form is edited by hand), returning equipment that was only reserved, a return time before the
pickup time, forms sent without their signed note, search text and names that look like SQL or
HTML, and staff-only pages, downloads, and feeds requested while signed out.

**Calendar.** A calendar above the department note shows loans due back, reservations to hand over,
software licenses and warranties that end, and events staff add themselves.

**Appearance.** The panel is smaller, and adds Auto mode, three backgrounds per mode, high
contrast, larger text, corner style, sans-serif titles, and reduced motion.

**Smaller changes.** The audit trail no longer shows ids or raw data, and extra fields can be
created from the add and edit forms.

## Verification

- Format check, ESLint, and TypeScript checks passed.
- 231 unit tests passed, including the new borrowing-availability rules, the sign-in limit, the
  calendar's months and days, the saved appearance choices (and the script that restores them),
  and the control-character cleanup.
- The launch suite ran every flow in a browser against an isolated database built from all 28
  migrations, including the new security and calendar tests.

## Database

`20261008000000_calendar_and_row_security`: the calendar's table, row level security on two
tables, a new kind of limited request for failed sign-ins, and removal of one redundant index. It
changes and removes no data. It must be applied **before** this version is deployed, because the
code reads the new table.

# Website audit, second pass — 7 October 2026

Stock and warranty tracking, a smarter import, faster and more responsive pages, and a rebuilt
QR scan flow, with a pass over the whole site for consistency.

**Inventory.** Stock records now warn when they run low: each record has its own alert level (5
by default), and the alert shows on the Inventory list, the item page, the dashboard, the
overview report, and a new Stock report. Equipment can be added as several identical units at
once, each with its own asset tag and QR code. A warranty end date is optional on any item, with
a Warranty report and an "ending soon" alert. Staff can add their own extra fields in Settings.
The add and edit forms now show only what is needed to start; everything else sits in optional
sections. Installed software can be marked licensed or not.

**QR codes.** The decision: one QR code per physical unit of equipment (so each can be borrowed,
reported, and found on its own), and one QR code per stock record (a box of markers is one
thing). That was already how the data worked; the change is that adding several units, or
importing a quantity, now creates a record and code for each. A signed-in phone that scans any
label goes straight to the record, with small Borrow, Return, and Report shortcuts. Anyone else
sees first, in plain colours, whether the item is available, in use until a time, or not
available, and then the three forms.

**Borrowing.** A "due today" list and ready-written return reminders; staff confirm the
borrower's school ID at check-out; the public forms are signed to the item and the moment they
were opened, so scripted or instant submissions are refused; the issue form asks for a name,
which staff see in Maintenance and reports. The Borrowing page no longer scrolls sideways.

**Import.** Headings are matched flexibly (many alternative names, any order, any row near the
top), missing columns fall back to defaults, extra columns fill matching extra fields or are kept
in the notes, empty and total rows are skipped, odd values (`₱1,200`, `8GB`, `1/15/2026`,
`broken`) are understood, and a value that cannot be understood is left blank and reported
instead of rejecting the row. **Check file** shows exactly what would happen before **Import**.

**Speed and feel.** The largest cause of slow pages was distance: the functions ran in the
default region while the database is in Singapore, so every query crossed the world. They are now
pinned to Singapore (`vercel.json`). A saved change re-rendered its page twice (once from the save,
once from the live-update refresh); now once. Every section has a page-shaped loading placeholder,
a progress bar appears the moment a link is pressed, the destination lights up in the sidebar at
once, an unused 80 KB font was removed, and a full-screen blend layer that slowed scrolling was
replaced.

**Consistency.** Quick navigation and the dashboard footer were removed. Reports can be printed
on the spot, and the audit trail has an "Open to print" link. Report columns, audit entries, and
the notepad lines were realigned, and the notepad shows the username. Card titles, form labels
for the same field, and people's names (always the username) now match across pages.

## Verification

- Format check, ESLint, and TypeScript checks passed.
- Unit tests cover the new logic: stock levels, warranty boundaries (Philippine calendar days),
  due-today windows, reminders, signed form tokens, the import's heading matching and value
  reading, and the new report builders.
- The launch suite runs the new flows in a browser against an isolated schema: low stock and
  per-record levels, adding several units, optional warranty and extra fields, a messy import,
  the in-use and unavailable public page, the staff scan shortcut, the issue form's name, due
  today with an ID check, and a readable layout of every page at phone and desktop widths in
  both themes.

## Database

One additive migration, `20261007000000_stock_alerts_warranty_custom_fields`: new optional
columns, one new table, and indexes. Nothing existing is changed or removed. It must be applied
**before** this version is deployed, because the new code reads the new columns.

# Website audit — 6 October 2026

A larger release than the earlier passes: new features, a new look, and a structural cleanup.

**Features.** Hardware and Software views in Inventory. Reports rebuilt around one data model, with
eight reports, filters for each, an in-page preview with a Generate step, and PDF and CSV downloads
drawn from the same data. Two account types (Administrator and Faculty staff). Borrowing limits
(3 days ahead, 7-day loans, 14 with an extension, 3 open requests, overdue block, missed pickups
released). An audit trail that opens on important changes and groups events by day. Filters that
apply as you choose them on every list.

**Look.** The charcoal-and-orange look was replaced by a paper-and-ink "ledger" look, with the
details in [design-system.md](design-system.md). The two overlapping stylesheets (about 5,900
lines) became six ordered files under `src/app/styles/`.

**Structure.** Large pages and action files were split into modules, repeated helpers were
merged, and sign-in is checked centrally as well as on each page.

Comparable products were reviewed for ideas that were not built; see
[research-notes.md](research-notes.md).

## Verification

- Format check, ESLint, and TypeScript checks passed.
- All 152 unit tests passed (including the report builders, the PDF renderer, audit views, borrowing
  limits, and the hardware and software grouping).
- Production build passed.
- The full launch suite (75 browser tests, including the public-page checks) ran against a
  production build in an isolated `ceit_test_launch_*` schema. All passed; one appearance-panel
  check first reported a button 0.00002px under 44px, so those buttons now have a small margin
  above the minimum, and that file was re-run and passed.
- Reports were generated in every format and every PDF was rendered to images and inspected.
- The interface was reviewed in both themes at desktop and phone widths.

Tests that encoded the old look were updated to the new one: the page backgrounds are now paper
and ink instead of neutral grays, and light is the default theme. The expectations that mattered
stayed the same: readable text of at least 14px, 44px touch targets, an accent that never tints the
page, a sidebar that stays in view, and the same hover and press behaviour.

---

# Website audit — 3 October 2026

Implemented a calmer CEIT equipment-register visual system, grouped navigation,
consistent headings, page titles, mobile layouts, and progressive disclosure for
advanced filters, bulk operations, account management, and record editing.
Dashboard actions now focus on the inventory and the staff review queue.

Performance changes remove repeated session reads within a render, narrow database
selections, parallelize independent queries, reduce dashboard queries from eleven
to six, and avoid loading up to 10,000 IDs during ordinary inventory browsing.
Live updates now inspect only the tables needed by the current page every five
seconds. No private page results are cached across users. Small-fixture remote
database timing remained network-bound; these changes reduce work, but do not
establish a production latency percentage improvement.

Functional fixes cover repeated URL filters, explicit bulk selection, searchable
maintenance item selection, scanner cancellation, accessible request and photo
dialogs, report resets, consistent PDF attention criteria, and clearly labelled
truncated report lists. Username inputs now use a valid browser pattern, including
hyphens. Existing optimistic updates and draft protection remain. The newer Student
survey page from the remote branch is preserved and included in the visual audit.

## Verification

- ESLint and TypeScript checks passed.
- All 76 unit tests passed, including live-update and PDF regression tests.
- Production build passed.
- Full production browser suite: 35 tests passed. After the final survey integration,
  account-security regression, and appearance changes, all 13 affected public and
  audit tests passed again (36 distinct scenarios across both runs).
- Final visual matrix: 17 routes, two themes, mobile and desktop widths
  (68 screenshots), checking overflow, duplicate IDs, and browser runtime errors.
- Account creation, self-service password changes, administrator resets,
  deactivation, and session revocation passed with temporary test accounts.
- Report reset, photo dialog keyboard controls, mobile command navigation, and
  compact appearance controls passed their regression checks.

Tests use the isolated `ceit_test_launch_*` schema, not normal inventory data.
Generated screenshots, credentials, and downloaded reports are not committed.

## Verification limits

Physical phone-camera scanning, the external survey's submission flow, the deployed host's cold starts and network latency,
physical printer output, production-scale load, and the school's backup/restore
process still need checks in their actual environments. Account listing remains
unpaginated; the queries no longer load password hashes and editors are collapsed.
This audit is evidence of the checked workflows, not a guarantee of zero defects.

## Corrections after the reported UI regressions

The first audit missed interaction failures in the staff appearance panel and did
not test the desktop sidebar after scrolling. The reported failures were real:
the appearance panel was trapped below the workspace's stacking context, body
overflow prevented reliable sticky positioning, and newer style rules reduced
many captions to 10–12px. The same stacking problem also covered the Inventory
tools dropdown with the filter form.

The appearance panel now renders outside the workspace, with usable controls,
viewport bounds, an always-reachable close button, outside-click dismissal, and
keyboard focus restoration. Escape closes the panel before the mobile navigation.
The sidebar remains in the viewport during document scrolling and scrolls its own
contents on short screens. Ordinary interface text is at least 14px, navigation
and work-queue titles use 16px, and mobile metric values align. Physical printed
labels retain their existing dimensions.

Dark mode uses neutral charcoal and light mode uses neutral white/gray throughout
the workspace and login page. Accent choices visibly update buttons, links,
selection indicators, and focus outlines while keeping page surfaces neutral.
Saved theme/accent choices and the default-color reset are tested. Login branding
was also corrected to maintain readable contrast in both modes.

Validation for these corrections:

- All 76 unit tests passed.
- Full production browser suite: 42 tests passed. After the final login contrast
  and mobile alignment corrections, all 20 affected browser tests passed.
- The 17-route, two-theme desktop/mobile matrix now checks actual rendered text
  size as well as overflow, headings, IDs, and browser errors. Existing responsive
  control checks also passed at 360, 768, 1024, and 1440px.
- Seven focused UI regressions cover actual appearance clicks above dashboard
  content, document/sidebar scrolling, 320px metric alignment, mobile keyboard
  behavior, visible and persistent theme/accent changes, dropdown navigation, and
  login text contrast. These explicitly wait for loaded dashboard content.
- Open-panel and scrolled-layout screenshots were visually reviewed, including
  short-screen and mobile views.

The environment-specific verification limits above still apply.

## Production follow-up

GitHub verification and the Vercel deployment of `93602b3` succeeded. A subsequent
read-only check of the public URL found that this deployment combined current
components and palette styles with an older compiled `globals.css`. The appearance
panel consequently used absolute positioning above the viewport. This was
reproduced by the public browser regression, which failed on the delivered panel
position rather than relying on deployment status alone.

Production builds now bypass persisted Turbopack compilation transforms to force
fresh output. The public Playwright suite also accepts `CEIT_E2E_BASE_URL`, so the
same tests can verify the actual public deployment without signing in or changing
production records. Browser asset caching and runtime data queries are unaffected.

The fresh build passed `npm run verify` and all seven public production-browser
tests locally. The new deployment-specific test fails on the older live asset,
covering panel positioning, pointer access, target size, scroll behavior, and
theme typography.

The deployed follow-up (`36aec37`) subsequently passed all seven public browser
checks at `https://ceit-inventory.vercel.app`, including actual pointer access to
appearance controls and the corrected neutral theme styles.

## Restrained design and interaction refinement

The next pass preserves the approved layout and neutral palette, adding label
details, equipment symbols, a timed activity rail, tactile buttons, and consistent
hover, press, focus, open, and saving states. See [design-refinement.md](design-refinement.md)
for the reference review and decisions. It adds no dependencies or database queries.

The broader browser run found an ambiguous wrapping label on the shared note when
it contained saved text. This is corrected with an explicit label and input ID.
Tablet metrics also adapt to the actual workspace width to avoid caption overlap.

Validation for this refinement:

- All 76 unit tests passed; formatting, ESLint, TypeScript, and the production
  build passed.
- The full browser run passed 46 of 47 scenarios and exposed the note-label issue.
  After correcting it and the tablet icon layout, all 19 affected checks passed,
  including the new public hover/press check: 48 distinct verified scenarios.
- The route matrix covered 17 pages in both themes at desktop/mobile widths.
  Focused metric checks covered 320, 390, 768, 1024, 1280, and 1440px, including
  caption overlap and number alignment.
- Pointer, keyboard, reduced-motion, pending-save, sidebar scroll, appearance
  layering, theme persistence, menu access, and text contrast were rechecked.
- Dashboard, inventory, reports, settings, borrowing, appearance, and narrow-screen
  screenshots were visually reviewed. Test data remains isolated from production.

## Equipment studio redesign — 4 October 2026

The repeated-card composition has been replaced with a more varied dashboard:
large editorial headings, original equipment line art, an open worklist/activity
column, and a compact ruled team memo. Shared typography, sign-in branding,
filters, record links, reports, and control shapes follow the same direction.
The favicon now uses the neutral charcoal palette. See
[design-refinement.md](design-refinement.md) for references and asset licensing.

The self-hosted variable font adds 24,836 bytes. The illustration is inline SVG;
there are no new dependencies, external runtime requests, or database queries.
Existing data actions and authorization remain unchanged.

Validation:

- All 76 unit tests passed.
- Final formatting, ESLint, TypeScript, and the normal production build passed.
- The complete isolated production-browser run passed all 49 scenarios, including
  the 17-route matrix in both themes at desktop/mobile widths, responsive controls,
  live updates, permissions, imports, borrowing/returns, concurrent reservations,
  CSV/PDF exports, and two-sheet batch labels.
- Visual review caught a duplicated brand on desktop sign-in. After that CSS
  correction, all 20 affected public/UI scenarios passed, including a new check
  across 320, 390, 768, 1024, and 1440px: 50 distinct verified browser scenarios.
- Font delivery is verified as same-origin; sign-in is checked at 320px with font
  requests blocked. Theme persistence, neutral surfaces, accent feedback,
  appearance pointer access, sticky sidebar scrolling, readable text, keyboard
  controls, reduced motion, and pending-save feedback all passed again.
- Dashboard, inventory, reports, borrowing, sign-in, mobile item creation, public
  QR item details, appearance, and mobile layouts were visually reviewed.

All data-changing browser tests used the isolated test schema, not production.

## Reference-led workspace and hold controls — 4–5 October 2026

Reviewed all nine supplied references and additional interface/motion guidance.
The resulting refinement uses a rounded workspace frame, compact page headings,
soft card layers, equipment symbols, and a status breakdown driven by the existing
dashboard aggregation. Hover, press, focus, and panel transitions are consistent;
reduced-motion preferences are respected. See [design-refinement.md](design-refinement.md).

Permanent single-item deletion and photo removal now offer a 1.1-second hold and
release interaction, plus an untimed click/keyboard confirmation. Moving away,
Escape, pointer cancellation, or loss of focus cancels holding. Server permissions,
history protection, and bulk typed confirmation remain intact. Buttons keep stable
bounds while their labels change and never submit just because the timer finishes.

Validation and corrections:

- All 76 unit tests passed. The isolated and normal production builds passed;
  final ESLint, TypeScript, formatting, and whitespace checks passed.
- The full 56-scenario browser run passed 55 checks. The remaining keyboard test
  attempted to focus hidden streamed markup before it became visible. After adding
  visibility, enabled-state, and focus assertions, it passed six consecutive runs.
- Browser coverage includes 17 routes in both themes at desktop/mobile widths,
  borrowing/returns, reservations and concurrency, imports, reports, permissions,
  live updates, fonts, appearance pointer access, and sticky-sidebar scrolling.
- All five hold tests passed: mouse release/cancellation, untimed keyboard
  confirmation, actual touch events, reduced motion, and retry after a protected
  history rejection. Successful deletion produces exactly one audit event.
- Mixed-status counts and the corresponding inventory-filter links passed,
  including 390px and 320px layout checks.
- Visual review caught shrinking appearance targets during entry, weak filled-hold
  contrast, and cramped desktop photo metadata. These were corrected. The final
  photo test checks filename fit and row height at desktop/mobile widths, and its
  resulting screenshots were reviewed again.
- The final print override and two-sheet label output passed a targeted browser
  check. Photo upload, viewing, focus restoration, and removal passed again after
  the last layout correction.

No dependencies, external image requests, or dashboard queries were added. All
data-changing checks used isolated schemas, which were removed after testing.

## Code review and workflow improvements — 6 October 2026

A full read-through of the application found the following problems, which are now fixed:

- **Import messages and preview.** Common row errors (an unknown category or location, an
  invalid date) were replaced by a generic "could not be imported" message. All row problems
  now explain themselves. The validate-only mode also missed problems the real import would hit:
  it now checks every field, Settings (missing or inactive categories and rooms), and
  identifiers that already exist, and reports "…and N more" when more than 20 rows need work.
- **Last-checked date drift.** The record edit form and the new-item form used the UTC calendar
  day while screens use Philippine time, so saving an edit made between midnight and 8 AM
  moved the inspection date back a day, discarded the recorded time, and logged a false
  `lastCheckedAt` change in the audit trail. The form now uses the Philippine day and keeps the
  recorded time when the day is unchanged.
- **Audit names.** Audit entries recorded a username, an email address, or both depending on
  the action. All new entries use the same `username | email` format.
- **CSV timestamps.** Exports contained UTC ISO timestamps (for example `2026-10-04T16:00:00.000Z`)
  that disagreed with the PDF reports. They now use Philippine time, and inspection and purchase
  dates are date-only.
- **Locked accounts.** The sign-in page tells staff to ask an administrator for help, but an
  administrator could neither see that an account was locked nor clear the lock (even a
  password reset left it locked). The Users page now shows "Locked", offers **Unlock account**,
  and a password reset clears the lock. Sign-in for unknown accounts now spends the same time as
  a real password check, so response time does not reveal which usernames exist.
- **Inconsistent "needs attention".** The dashboard counted only Defective items while the PDF
  reports also counted Not tested and poor condition (including retired and lost records). They
  now share one definition and the dashboard links to the matching Inventory filter.
- **Borrower data retention.** Redaction only ran when someone scheduled a script, which cannot
  happen on Vercel. It now also runs automatically from the dashboard, at most every six hours.
- **Photos** were re-read from the database on every view (`no-store`); they are now cached
  privately in the browser for an hour.
- **Smaller fixes.** The Delete location button used a fixed red that was hard to read on the
  light theme; the overview PDF's overdue list now shows the return time; unused categories
  can be deleted; an open maintenance request on a Defective item reminds staff to restore the
  equipment status.

Workflow additions: overdue tracking and return-time changes, public availability times,
multi-word search with MAC/IP matching, "needs attention" and "not checked in 90+ days" filters,
bulk inspection, and keyboard navigation plus equipment search in quick navigation.
See [launch-checklist.md](launch-checklist.md) for the staff-facing rules.

No database migration is required for this release.
