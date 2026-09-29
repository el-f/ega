# Chrome Web Store icons + promo tiles

## The icon font

The icon is the ע glyph set in Gveret Levin (AlefAlefAlef, SIL Open Font License 1.1).
The OFL allows a product icon made with the font. The font and its license text are in
`scripts/icon-font/`, and `THIRD_PARTY.md` carries the notice in its "Extension icon"
section (written by `scripts/gen-third-party.ts`).

## Required: 128×128 store icon

Use the existing `src/assets/icons/icon-128.png`. The CWS listing
form accepts a direct upload — point it at that file. No separate
copy is needed here; the source icon is the one to upload.
`pnpm gen:icons --force` redraws all sizes from the font through
Playwright's headless Chromium; without `--force` it keeps the
committed PNGs. `EGA_ICON_FONT` points it at a different TTF.

If the store review ever asks for a store-only icon (for example,
one with a background that works in light and dark themes), save it
here as `icon-128-store.png`.

## Optional: promo tiles

CWS lets you upload promo tiles that surface in the "Featured"
carousel and category browse pages. None are required. A listing
with no tiles does not appear in those places.

| Asset        | Size     |
| ------------ | -------- |
| Small tile   | 440×280  |
| Marquee tile | 1400×560 |

Check sizes and rules against the form the dashboard shows you.

Drop finished tiles in this directory as `promo-small.png` and
`promo-marquee.png`. Git ignores `*.png` / `*.jpg` in this folder so
raw design exports don't bloat the repo.

## How the assets get to the CWS dashboard

The release workflow (`.github/workflows/release.yml`) builds the
extension zip and attaches it to a GitHub Release. To publish on the
Chrome Web Store:

1. Downloads the zip from the Release page.
2. Uploads to CWS dashboard → "Upload new package".
3. Drags `src/assets/icons/icon-128.png` and any promo tiles from
   this folder into the listing form fields.
4. Pastes `store/description.md` into the Detailed description
   box, `store/short-description.txt` into the Summary box, and
   the text from `store/permissions.md` into the "Permission
   justification" boxes as CWS prompts per permission.

Listing copy and images are uploaded by hand.
