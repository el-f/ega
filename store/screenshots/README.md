# Chrome Web Store screenshots

CWS takes up to 5 screenshots. Each must be exactly **1280×800** or **640×400**
PNG or JPEG. At least one is required to submit. This folder holds none yet.

`store/screenshots/*.png` is in `.gitignore`, so the files you make here stay
out of the repo. Upload them by hand in the dashboard; the packed zip carries no
screenshots.

## What the repo already captures, and why it does not fit

`pnpm showcase` runs `tests/e2e/showcase.spec.ts`. It launches the real unpacked
build in dark mode at 2x pixel density, seeds configured backends, mocks the API
and writes four PNGs to `docs/media/`. Those are README images, not store images:

| File                       | Size      | What it is                                       |
| -------------------------- | --------- | ------------------------------------------------ |
| `docs/media/tooltip.png`   | 1512×1016 | a forum page with the tooltip, cropped to both   |
| `docs/media/popup.png`     | 720×690   | the popup, cropped to its body                   |
| `docs/media/sidepanel.png` | 800×2000  | the side panel at Chrome's 400px default width   |
| `docs/media/backends.png`  | 2360×1204 | Settings → Backends, cropped after the sixth row |

None is a CWS size. `pnpm visual:capture` does not help either:
`tests/e2e/screenshot-audit.spec.ts` shoots with `fullPage: true`, which gives a
height that follows the page.

## Recipe A — patch the showcase spec (repeatable)

Three edits to `tests/e2e/showcase.spec.ts`, then one command:

1. Set `MEDIA_DIR` to this folder: `path.resolve(__dirname, '..', '..', 'store', 'screenshots')`.
2. In `beforeAll`, launch with `deviceScaleFactor: 1` instead of `2`.
3. Set every `setViewportSize` to `{ width: 1280, height: 800 }` and call `save()`
   without its `clip` argument, so each shot is the whole 1280×800 viewport.

Then run `pnpm showcase`. It rebuilds `dist/` itself with `EGA_E2E_HOOKS=1`
(`tests/e2e/globalSetup.ts`) and writes `tooltip.png`, `popup.png`,
`sidepanel.png` and `backends.png` here. Rename them to the numbered names below,
which are the order CWS shows them in.

That leaves `dist/` carrying the E2E test hooks. **Never zip that build.** Run a
clean `EGA_STORE_BUILD=1 pnpm build` again before you pack the upload.

Check each result before you upload:

```
node -e "const b=require('fs').readFileSync('store/screenshots/tooltip.png');console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20))"
```

Revert the three edits afterwards, or `pnpm showcase` stops refreshing the README
images.

**One caveat.** The popup and the side panel are narrow surfaces in Chrome. Loading
their pages in a 1280×800 viewport stretches them across the full width. The result
is compliant but does not look like the real thing. The tooltip shot and the
Settings → Backends shot fill 1280×800 on their own, so ship those two first.

## Recipe B — capture the narrow surfaces by hand

For the popup and the side panel, and for anything the spec cannot reach.

1. `pnpm build`, then Chrome → `chrome://extensions` → Developer mode → Load
   unpacked → pick `dist/`. Build without `EGA_STORE_BUILD`, so the extension id
   stays the fixed one and an installed native host keeps working.
2. Open the surface you want in a normal tab:
   - popup: `chrome-extension://<id>/src/popup/index.html`
   - side panel: `chrome-extension://<id>/src/sidepanel/index.html`
   - options: `chrome-extension://<id>/src/options/index.html`
3. F12 → Toggle device toolbar → set the viewport to 1280 × 800 → `⋮` →
   "Capture screenshot". DevTools writes exactly the viewport size.
4. Save it here under the name from the list below.

## The shots, in listing order

CWS shows the first five in the carousel, so order matters.

| Name                        | Recipe A file   | What it shows                                                                                                     |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `01-bubble-and-tooltip.png` | `tooltip.png`   | A phrase selected on a real page and the tooltip answering over it. The shot that explains the product.           |
| `02-sidepanel.png`          | `sidepanel.png` | The side panel holding two or three turns of one site's thread, with the backend picker in the top bar.           |
| `03-popup.png`              | `popup.png`     | The launcher: four tiles (translate page, pick an element, clipboard, side panel) and the text box under them.    |
| `04-options-backends.png`   | `backends.png`  | Settings → Backends, the provider card grid. Let the availability probes settle first. No real API key on screen. |
| `05-options-languages.png`  | —               | Settings → Languages: built-in languages plus a custom one, edit panel open on a single entry. Recipe B only.     |

Optional extras beyond the first five: an image OCR result in the side panel, the
smart-bubble banner.

## Before you upload

- Exactly 1280×800, PNG or JPEG.
- No API key, no real personal chat, no real name in any shot.
- No Middle-earth artwork, character names or place names. The Elvish varieties
  are named in the copy, and that is where it stops.
