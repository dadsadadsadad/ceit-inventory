# Design system: the ledger look

CEIT Inventory looks like what it manages: tagged equipment in a department ledger. The interface
uses warm paper and dark ink, one orange accent, a serif for what a page is about, a clean sans for
working, and a mono for asset tags and codes.

This replaces the earlier charcoal-and-orange look described in
[design-refinement.md](design-refinement.md), which is kept as a record of that pass.

## Ideas behind it

- **Paper and ink.** Light is the default: an ivory page, slightly lighter paper cards, and ink text.
  Dark is a warm near-black with the same paper as text. Neither theme is tinted by the accent.
- **One accent.** CEIT orange marks what can be clicked or is selected: buttons, links, the active
  navigation item, focus rings, and the diamond bullet before each page's label. Staff can still
  pick their own accent in Appearance, and everything follows it.
- **Type with a job.** Fraunces (serif) is used for page titles, section headings, and big numbers.
  Manrope (sans) is the interface. IBM Plex Mono is used for labels, table headings, and asset tags.
  Text is never smaller than 14px.
- **Ledger details.** Pages start with a small mono label, a serif title, and a double rule. Cards
  have hairline borders and a soft paper shadow. Summary numbers sit in one ruled strip with dashed
  dividers, like tear-off stubs. The department note is a memo with ruled lines and a folded corner.
  The logo is a hang tag.
- **Quiet motion.** Buttons lift a pixel on hover and press down; rows tint; menus fade in. With
  reduced motion on, nothing moves and nothing transitions, but every state still changes colour.

## Where things live

| File                            | What it holds                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `src/app/styles/tokens.css`     | Colours for both themes, accent defaults, status colours, type families, radii   |
| `src/app/styles/base.css`       | The page paper (with a faint grain), typography, focus, motion preferences       |
| `src/app/styles/shell.css`      | Sidebar, navigation, page frame and headers, appearance picker                   |
| `src/app/styles/components.css` | Cards, buttons, fields, pills, chips, tables, tabs, disclosures, hold-to-confirm |
| `src/app/styles/pages.css`      | Overview, item records, public scan pages, sign-in, QR labels, print rules       |
| `src/app/styles/views.css`      | Hardware and software directories, audit trail, reports                          |
| `src/lib/reports/pdf/theme.ts`  | The PDF colours, taken from the same palette                                     |

## Appearance options

Each device can adjust the look without touching the code; every choice is an attribute on `<html>` set before the page paints (`src/lib/appearance-bootstrap.ts`) and styled in `src/app/styles/preferences.css`. The standard choice for each has no attribute.

| Option      | Choices                                  | Attribute                           |
| ----------- | ---------------------------------------- | ----------------------------------- |
| Mode        | Light, Dark, Auto (follows the device)   | `data-theme`, `data-mode`           |
| Background  | Paper, Bright, Cool; Ink, Midnight, Black | `data-tone` (one per mode)         |
| Accent      | Orange default, seven presets, any color | `--accent*` properties              |
| Text size   | Default, Large, Larger                   | `data-text` (scales every rem)      |
| Corners     | Sharp, Default, Round                    | `data-corners` (radius tokens)      |
| Titles      | Serif, Sans                              | `data-titles` (`--font-display`)    |
| Contrast    | Standard, High                           | `data-contrast`                     |
| Motion      | Full, Reduced                            | `data-motion`                       |

Fonts are self-hosted from `src/app/fonts/` (Manrope, Fraunces, and IBM Plex Mono, all under the
SIL Open Font License; the licence texts are alongside the font files).

## Rules to keep

- Read colours from the tokens instead of writing hex values, so both themes and the accent work.
- Keep body text at 14px or larger and touch targets at 44px.
- Do not add a second accent colour. Status colours (OK, deployed, pending, critical, retired) are
  the only other colours, and they always come with a word or a dot, never colour alone.
- Printing uses a white page; labels and reports must not depend on the screen colours.
