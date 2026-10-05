# Tactile workspace refinement — 4–5 October 2026

> This describes the earlier charcoal-and-orange look. It was replaced by the paper-and-ink look in
> [design-system.md](design-system.md); the behaviours listed here (hold-to-confirm, reduced motion,
> 14px text, sticky sidebar) still apply.

This pass follows the nine user-supplied references through layout, hierarchy,
spacing, surface depth, and interaction behavior. It does not copy their brands,
artwork, layouts, or page content.

## Reading the references

| Reference                    | Principle applied to CEIT                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Asset-management table       | A framed workspace, grouped filters, clear record identities, and readable status information.              |
| Bagel landing page           | Restraint in the surrounding space, with small moments of color and tactile controls.                       |
| Green dashboard presentation | Soft panel boundaries and a clear active navigation state; CEIT retains neutral surfaces.                   |
| School calendar              | Predictable heading/action placement and clear information groups. No unrelated calendar feature was added. |
| Finance dashboard            | Compact summaries, quiet card boundaries, and deliberate control hierarchy.                                 |
| Walking widget               | Strong numeric hierarchy and visible progress inside the hold control.                                      |
| Fountn dark interface        | Layered charcoal surfaces and a single identifying accent.                                                  |
| Mobile habit screens         | Rounded touch targets, stacked groups, and clear primary actions on narrow screens.                         |
| Hover animation reference    | Brief, localized feedback on the element being used.                                                        |

Additional research:

- [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh)
  informed consistent hierarchy, spacing, and action placement.
- [Material motion](https://m3.material.io/styles/motion/overview/how-it-works)
  was reviewed for purposeful state transitions.
- [W3C pointer cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)
  informed release-to-submit, move-away cancellation, and the untimed confirmation
  alternative for destructive actions.

## Changes

- Desktop pages use a continuous workspace background, with soft neutral card layers.
  Headers are more compact and forms, buttons, tables, and navigation share the
  same corner and spacing language. The dashboard's large decorative opening is
  replaced by a direct heading and primary action.
- The outer workspace border, inset, and rounded frame were removed following
  feedback. The sign-in equipment illustration was also removed; its area is blank.
- The inventory mix uses the existing dashboard aggregation, with an accessible
  text legend linking to the corresponding inventory filters. Counts describe
  records, not physical supply quantities. There is no extra database query or
  chart dependency.
- Inventory rows gain quiet equipment/computer symbols without fetching photos
  or adding image requests. Summary icons use small semantic color accents.
- Hover states move icons slightly, reveal row emphasis, and tint selections.
  Buttons distinguish hover and press. Panels and page content enter briefly;
  the status bar reveals once. There are no continuous decorative animations.
- The existing neutral light/charcoal themes, customizable accent, 14px minimum
  ordinary text, sticky sidebar, and portal-based appearance controls remain.
- Single-record deletion and photo removal support a 1.1-second hold. Holding
  only arms the control; release inside its bounds submits. Moving away, Escape,
  pointer cancellation, losing focus, or hiding the page cancels the gesture.
  A click or keyboard activation opens an untimed Confirm/Cancel alternative.
  Bulk deletion retains its existing typed confirmation.
- Reduced-motion preferences disable decorative movement. The hold control uses
  a static ready state instead of a sweeping fill. Existing server permissions,
  protected-history checks, error messages, and pending-submit protection remain.

The previously self-hosted Manrope font (24,836 bytes) and its
[SIL Open Font License](../src/app/fonts/OFL-Manrope.txt) remain unchanged. This
pass adds no library dependencies, external runtime services, or raster assets.

Validation is recorded in [site-audit.md](site-audit.md).
