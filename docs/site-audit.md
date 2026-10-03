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
