#!/usr/bin/env tsx
/** Renders the glyph to 16-128px PNGs in headless Chromium (sharp and resvg ignore @font-face); the font is inlined. */

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'src/assets/icons');
// Gveret Levin by AlefAlefAlef, SIL OFL 1.1 (scripts/icon-font/OFL.txt). EGA_ICON_FONT swaps in another TTF.
const FONT_PATH =
  process.env['EGA_ICON_FONT'] ?? path.join(ROOT, 'scripts/icon-font/GveretLevin-Regular.ttf');
const FAMILY = 'Ega Icon Glyph';
const SIZES = [16, 32, 48, 128] as const;
const FORCE = process.argv.includes('--force');

async function main(): Promise<void> {
  // Anti-aliasing differs across Chromium builds, so a routine run keeps the committed PNGs instead of rewriting them.
  if (!FORCE) {
    const existing = await Promise.all(
      SIZES.map((s) =>
        readFile(path.join(ICON_DIR, `icon-${s}.png`)).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (existing.every(Boolean)) {
      console.log('Icon PNGs present — keeping them. Run `pnpm gen:icons --force` to redraw.');
      return;
    }
  }
  const fontBuf = await readFile(FONT_PATH);
  const fontDataUrl = `data:font/ttf;base64,${fontBuf.toString('base64')}`;

  const html = `<!doctype html>
<html><head><style>
  @font-face {
    font-family: '${FAMILY}';
    src: url('${fontDataUrl}') format('truetype');
  }
  html, body { margin: 0; padding: 0; background: transparent; }
  .icon {
    width: 128px; height: 128px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 24px;
    background: linear-gradient(135deg, #4f8cff 0%, #32d3d3 100%);
    font-family: '${FAMILY}', sans-serif;
    color: #0a2550;
    line-height: 1;
  }
</style></head>
<body><div class="icon">ע</div></body></html>`;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    // `fonts.ready` also resolves when the face failed, and the sans-serif fallback renders a different glyph.
    const loaded = await page.evaluate((f) => document.fonts.check(`96px "${f}"`), FAMILY);
    if (!loaded) throw new Error(`icon font did not load from ${FONT_PATH}`);

    for (const size of SIZES) {
      // Resizing the element, not the viewport, keeps downscaling in Chromium's compositor with native AA.
      await page.setViewportSize({ width: size, height: size });
      await page.evaluate((s) => {
        const el = document.querySelector('.icon') as HTMLElement | null;
        if (!el) throw new Error('.icon missing');
        el.style.width = `${s}px`;
        el.style.height = `${s}px`;
        el.style.borderRadius = `${s * 0.1875}px`; // 24/128 ratio
        el.style.fontSize = `${Math.round(s * 0.8125)}px`;
        // The Regular weight reads thin on a toolbar; a stroke in the fill color thickens it.
        el.style.setProperty(
          '-webkit-text-stroke',
          `${Math.max(1, Math.round(s * 0.0234))}px #0a2550`,
        );
      }, size);
      const buf = await page.locator('.icon').screenshot({ omitBackground: true });
      await writeFile(path.join(ICON_DIR, `icon-${size}.png`), buf);
      console.log(`wrote icon-${size}.png (${buf.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
