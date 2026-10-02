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
truncated report lists. Existing optimistic updates and draft protection remain.

## Verification

- ESLint and TypeScript checks passed.
- Initial unit run: 73 tests passed; three additional PDF regression tests also passed.
- Production build passed.
- Visual browser matrix passed: 16 routes, two themes, mobile and desktop widths
  (64 screenshots), checking overflow, duplicate IDs, and browser runtime errors.
- Initial full browser run found three failures: report reset behavior and two
  incorrect new-test selectors. Fixes are applied; final rerun is pending.
- A mobile keyboard-navigation regression was added after moving the command
  dialog outside the collapsed sidebar; its final rerun is pending.

Tests use the isolated `ceit_test_launch_*` schema, not normal inventory data.
Generated screenshots, credentials, and downloaded reports are not committed.

## Verification limits

Physical phone-camera scanning, the deployed host's cold starts and network latency,
physical printer output, production-scale load, and the school's backup/restore
process still need checks in their actual environments. Account listing remains
unpaginated; the queries no longer load password hashes and editors are collapsed.
This audit is evidence of the checked workflows, not a guarantee of zero defects.
