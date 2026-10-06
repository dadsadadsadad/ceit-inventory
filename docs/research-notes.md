# Research notes: how other inventory tools work

These are notes for the thesis, not a to-do list that has been built. Nothing in the "Ideas" columns
below exists in the app yet. They are written down so the panel (and future maintainers) can see what
comparable tools do, what CEIT Inventory already covers, and what would be sensible next steps.

Sources are public product pages and documentation, read in October 2026. Where a vendor page was only
a marketing summary, the feature is described the way the vendor describes it, not tested by us.

## Tools looked at

### Snipe-IT (open source IT asset management)

What it is known for: check-in/check-out of assets to people and locations, a full audit log with
timestamps and who did it, license and seat tracking, depreciation, warranty tracking, QR/barcode
labels, CSV/Excel exports, and email notifications on check-out.

| Feature                           | In CEIT Inventory now                                             | Idea for later                                               |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Check-out / check-in with history | Yes (borrowing, reservations, returns, per-item history)          | Email or SMS receipt to the borrower                         |
| Audit log with who/when           | Yes (audit trail, now with an Important view and day grouping)    | Tamper-evident log (hash chain) for thesis defence           |
| License and seat tracking         | Partly (license expiry per install, grouped on the Software page) | Seat counts: licenses bought vs installs found               |
| Depreciation, warranty            | No                                                                | Warranty end date on the item, "warranty ending soon" report |
| Label printing                    | Yes (single and sheet printing)                                   | Label templates per paper size                               |

### Sortly (inventory app for small teams)

Known for: very fast scanning and QR labels, low-stock alerts, custom fields, and a small set of
well-chosen reports: activity, inventory summary (quantity and value for the current filters), low
stock, and a "move summary" listing every location change in a period.

| Feature                                         | In CEIT Inventory now                                       | Idea for later                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Summary report that follows the current filters | Yes (Reports now builds from the same filters as the lists) | "Open as report" from every list (done for Inventory, Borrowing, Maintenance, Hardware, Software) |
| Low-stock alerts                                | No (supplies have a quantity but no minimum)                | Minimum quantity per supply and a "running low" report                                            |
| Move summary                                    | Partly (moves appear in the audit trail)                    | A dedicated "moved equipment" report                                                              |
| Custom fields                                   | No                                                          | Per-category custom fields (for example "lens mount" for cameras)                                 |

### EZOfficeInventory (EZO)

Known for: reservations with an availability calendar and conflict-free booking, "fuzzy" reservations
(reserve a type of item first, assign the exact unit later), service tickets with recurring
preventive maintenance, audits where custodians confirm they still hold an asset, and vendor,
purchase-order, and lifetime-cost tracking.

| Feature                             | In CEIT Inventory now                                                                | Idea for later                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Conflict-free reservations          | Yes (overlaps are rejected, now limited to 3 days ahead, with a pickup grace period) | Calendar view of bookings per item or per week                                      |
| Reserve a type, assign a unit later | No                                                                                   | Useful for "any projector" requests                                                 |
| Recurring preventive maintenance    | No (maintenance is on demand)                                                        | Repeat schedule per item (for example clean projector filters every 6 months)       |
| Asset audits / cycle counts         | Partly (inspection date and a "not checked in 90+ days" filter)                      | A guided "audit this room" mode: scan every item in a room and list what is missing |

### Lansweeper (network discovery and IT inventory)

Known for: scanning the network to collect hardware specs, installed software, and OS versions
automatically, then reporting on license compliance (licenses paid for vs in use, and on which
computers), plus warranty tracking.

| Feature                         | In CEIT Inventory now                                              | Idea for later                                                                           |
| ------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Hardware inventory per PC       | Yes, typed in by staff (Hardware page, "by component" and "by PC") | A small script staff run on a PC to fill in the specs automatically (no always-on agent) |
| Software installed per PC       | Yes, typed in by staff (Software page)                             | Import from a CSV exported by a free inventory tool                                      |
| Compliance view (paid vs used)  | No                                                                 | Seat count per software title                                                            |
| Reports by hardware or software | Yes (new Hardware and Software reports)                            | Scheduled monthly report by email                                                        |

### CHEQROOM (equipment checkout used by universities)

Known for: a dashboard showing reservations and check-outs at a glance, a calendar of every
reservation and check-out, kits (bundles of items that are usually borrowed together), return
reminders as the due date approaches, and a mobile app.

| Feature            | In CEIT Inventory now                         | Idea for later                                                         |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| Return reminders   | Yes: a "due today" list and a ready-written message to copy | Send the reminder automatically the day before the return time |
| Kits / bundles     | No                                            | Borrow a camera kit as one request                                     |
| Calendar           | No                                            | Month and week calendar of reservations                                |
| Borrower agreement | No                                            | A short "I will return this by..." acknowledgement on the request form |

## Design references

The goal of the redesign was "premium, simple-ish, professional, not generic". Looking at what the
well-regarded workspace tools do:

- **Linear:** dark-first, near-black surfaces with a few lifted steps, one workhorse typeface, color
  used sparingly like a signal, high information density kept clean by consistent spacing and muted
  colors, and a keyboard-first command menu as the real way around the product. (CEIT Inventory tried a
  quick-navigation menu and removed it: with a dozen pages, the sidebar is faster.)
- **Stripe and Vercel dashboards:** precision over decoration. One sans family (Inter or Geist), a
  monospace for IDs and money, tabular figures for any column of numbers, tight downward shadows only
  on floating layers (menus, dialogs), no glass or blur.
- **Takeaway for us:** copying those would still look like "another SaaS dashboard". CEIT Inventory's
  own character should come from its subject, which is physical equipment with labels on it. Ideas:
  asset tags and QR stickers as a recurring visual motif, paper-and-ink colors with one orange accent
  (the CEIT dot), a serif display face for page titles paired with a clean sans for data, and a
  monospace for asset tags. The generated PDFs follow the same palette so printed reports look like
  they came from the same place.

## Decisions made while building (and why)

| Decision                                                                                                                                                                    | Reason                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two account types only: Administrator and Faculty staff                                                                                                                     | The department asked for it; faculty staff can do everything except create or change accounts. The database role names stay the same, only the labels changed, so no migration was needed. |
| Reservations at most 3 days ahead, loans at most 7 days, extensions up to 14 days in total, at most 3 open requests per student, no new requests while something is overdue | Without limits, equipment can be hoarded or booked "forever". All values are defaults that can be changed with environment variables, not code.                                            |
| A reservation that is not picked up within 2 hours of its start, and a pending request not handled within 24 hours, stop holding the equipment                              | Releases equipment automatically without a background job: the rule is checked whenever someone looks at the item or books it.                                                             |
| Audit trail opens on "Important" and hides QR scans, label prints, report downloads, and sign-ins until asked for                                                           | Those events happen constantly and bury the changes people actually audit. Nothing is deleted; "Routine" and "Everything" are one click away.                                              |
| Filters apply as you choose them and live in the URL                                                                                                                        | Every filtered view can be bookmarked, shared, and reached with the back button; no "Filter" button to forget.                                                                             |
| Reports are generated on the page first, then printed or downloaded                                                                                                         | Staff can check the numbers before they print or share them. The preview, the PDF, and the CSV are built from the same data, so they cannot disagree.                                      |
| Equipment gets one QR code per physical unit; stock gets one QR code per record                                                                                             | A QR label is stuck on a thing. Each PC or projector can be borrowed, reported, and located on its own, so each needs its own code. A box of markers is one thing however many it holds. Adding several identical units at once (or importing a quantity) creates a record and code for each. |
| Signed-in phones that scan a label go to the record; everyone else gets the public page                                                                                     | Staff scan to fix or update something, borrowers scan to borrow or report. Borrow, return, and report stay one tap away for staff.                                                         |
| The app's functions run in the same region as the database                                                                                                                  | Distance, not code, was the largest cause of slow pages: every query crossed the world and back. Fewer round trips and instant feedback come second.                                       |
| An import never fails the whole file for a messy value                                                                                                                      | Real spreadsheets are untidy. Only a missing item name or a duplicate identifier skips a row; everything else is adjusted or left blank, and the result lists what happened.               |

## Backlog ranked by usefulness for this department

Done: return reminders and a "due today" list, warranty end date with a warranty report, a
minimum quantity for stock with low-stock alerts and a stock report, and custom fields (which can be
limited to a type or a category).

1. Seat counts for software licenses (paid vs installed).
2. Guided room audit: scan everything in a room and see what is missing.
3. Calendar view of reservations.
4. Preventive maintenance schedules.
5. Kits (borrow several items as one request).
6. Scheduled email of a saved report.
7. Reminders sent by SMS or email on their own (today staff copy the message).
