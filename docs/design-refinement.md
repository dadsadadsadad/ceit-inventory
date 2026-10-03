# Design refinement — 3 October 2026

The direction is **distinctive details with familiar controls**. Keep the neutral
charcoal/white palette, readable type, quiet page structure, and existing workflows.
Use the visual language of a department equipment register: small label brackets,
equipment symbols, ruled notes, and a chronological activity rail. Accent color
belongs on actions, current selections, and a few identifying marks.

## Reference review

Browsed the large [Siteinspire](https://www.siteinspire.com/) and
[Mobbin](https://mobbin.com/) collections, then examined selected product and design
references. This was a focused reference review, not an individual audit of
thousands of websites.

- [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh):
  predictable hierarchy and restrained supporting navigation. Preserve the current
  layout and avoid adding competing actions.
- [Things](https://culturedcode.com/things/): a small amount of tactile character
  can make an otherwise straightforward productivity interface feel considered.
  Apply that through restrained button edges and the existing department note.
- [Raycast](https://www.raycast.com/): reviewed its presentation and shortcut-led
  navigation. Keep quick navigation accessible within the sidebar; its dramatic
  marketing presentation is not appropriate for this inventory workspace.
- [Carbon motion guidance](https://www.carbondesignsystem.com/building-blocks/foundations/motion/choreography):
  equivalent interactions should give consistent feedback. Use short, small
  transitions and preserve non-motion feedback for reduced-motion preferences.

These informed the decisions; no reference layouts, assets, or animation libraries
were copied into the application.

## Implementation

- Label brackets and a short accent rule identify page headers without adding a
  banner or extra content. The header keeps its existing stacking behavior.
- Equipment, location, and maintenance symbols replace arbitrary metric indices.
  Narrow workspaces hide the decorative symbols to preserve readable captions.
- Requests have distinct icon treatments, highlighted hover/keyboard states, and
  a small directional cue. The activity list connects actual events and shows
  Philippine local times alongside dates.
- Primary and secondary buttons have subtle depth. Hover and press are separate
  states; a press no longer loses to the hover transform in the cascade.
- Navigation, disclosures, menu choices, links, and keyboard-focused table rows
  provide visible feedback. Open appearance controls keep their selected state.
- Saving buttons show a progress indicator with the existing pending label and
  repeat-click protection. Reduced-motion users retain color and focus feedback
  without moving controls or a spinning indicator.
- The shared note has an explicit input label that remains identifiable when the
  saved note is nonempty. The save-feedback regression exercises this case.

The changes use CSS, existing icons, and the existing server-rendered data. They
introduce no dependencies, images, external requests, or extra database queries.
