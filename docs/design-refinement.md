# Equipment studio — 4 October 2026

The previous refinement changed small details but left the same repeated-card
composition. This pass changes the visual hierarchy and layout: an open work
surface, a typographic introduction, original equipment artwork, and a compact
team memo. The daily controls remain straightforward.

## Reference review

The earlier review browsed the large [Siteinspire](https://www.siteinspire.com/)
and [Mobbin](https://mobbin.com/) collections and selected references from
[Linear](https://linear.app/now/behind-the-latest-design-refresh),
[Things](https://culturedcode.com/things/), and [Raycast](https://www.raycast.com/).
This was a focused review, not an individual audit of thousands of websites.

This pass also examined:

- [Teenage Engineering](https://teenage.engineering/): restrained color,
  equipment-led identity, and confident typography. The application uses its own
  illustration of a monitor, projector, and asset tag, drawn directly in SVG.
- [Pentagram's MIT Media Lab identity](https://www.pentagram.com/work/mit-media-lab):
  a consistent identity can support varied compositions. CEIT's existing monogram
  now appears consistently on sign-in and navigation.
- [Carbon's motion guidance](https://www.carbondesignsystem.com/building-blocks/foundations/motion/choreography):
  preserve consistent, brief interaction feedback without decorative movement.

No reference layout, logo, or illustration was copied.

## Implementation

- Manrope establishes a consistent type system across platforms. Large,
  medium-weight headings pair with quieter monospaced labels and asset codes.
  Ordinary interface text retains the 14px minimum; primary navigation and queue
  labels remain 16px. Physical print-label dimensions are preserved.
- The dashboard pairs its introduction with an original equipment line drawing.
  Summary counts have clearer hierarchy. Requests and activity share an open left
  column, with the memo on the right when space allows; narrow screens stack them.
- Repeated outer boxes and title decorations were removed where they added noise.
  Inventory filters sit directly above the records; item names use neutral type
  with accent and underline feedback on interaction. Reports use quieter metrics.
- The shared note has a contrasting neutral paper surface, accent edge, ruled
  writing area, and visible saving feedback. Its contents and permissions are
  unchanged.
- Sign-in uses the same identity, original illustration, and typography, with a
  direct unboxed form. Mobile keeps the form compact and omits decorative artwork.
- Existing hover, press, keyboard focus, selected, open, and pending states remain
  visible. Reduced-motion preferences suppress moving controls and spinners.
- Dark mode remains charcoal and light mode remains white/gray. Custom accents
  affect actions, selections, focus, and identifying details rather than tinting
  the page. Appearance layering and sidebar scrolling fixes are preserved.

## Asset and performance budget

The self-hosted variable font is **24,836 bytes**, uses `next/font/local` with
`display: swap`, and is served from the application's own origin. Its
[SIL Open Font License](../src/app/fonts/OFL-Manrope.txt) is included. Source:
[Google Fonts' Manrope distribution](https://fonts.google.com/specimen/Manrope).
The browser regression verifies local delivery and usable 320px sign-in when the
font request is blocked.

The equipment illustration is server-rendered inline SVG. This pass adds no
animation libraries, raster images, database queries, or third-party runtime
requests. Existing server-rendered data, permission checks, and business actions
are retained.

Validation is recorded in [site-audit.md](site-audit.md).
