import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

// The countable design rules (STANDARDS R9/R16/R20, ui-design-quality.md), checked on the real layout jsdom cannot give.

/**
 * Ega's own UI on the page: the whole document on an extension page, the shadow root on a web page (never the host page's DOM).
 * Returns one line per broken rule, stable across runs so a baseline can list known debt:
 * - `clip <element>`: a button, select or label whose text is wider than its box (cut off).
 * - `font <px> <element>`: text whose computed size is not one of the --fs-* tokens.
 */
export async function designRuleViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const host = document.getElementById('ega-shadow-host');
    const onExtensionPage = location.protocol === 'chrome-extension:';
    const root: Document | ShadowRoot | null = onExtensionPage
      ? document
      : (host?.shadowRoot ?? null);
    if (root === null) return [];
    const tokenSource = onExtensionPage ? document.documentElement : (host as HTMLElement);
    const vars = getComputedStyle(tokenSource);
    const scale = new Set<number>();
    for (const name of ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl']) {
      const px = Number.parseFloat(vars.getPropertyValue(`--fs-${name}`));
      if (Number.isFinite(px)) scale.add(px);
    }

    const describe = (el: Element): string => {
      const ega = [...el.attributes].find((a) => a.name.startsWith('data-ega-'));
      const tag = el.tagName.toLowerCase();
      const id = ega ? `[${ega.name}${ega.value ? `="${ega.value}"` : ''}]` : '';
      const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${tag}${id} "${text}"`;
    };
    // A 1px box is a screen-reader-only label (.ega-sr-only), clipped on purpose.
    const visible = (el: Element): boolean =>
      el.checkVisibility({ visibilityProperty: true, opacityProperty: false }) &&
      el.getBoundingClientRect().width > 1;

    const out = new Set<string>();
    for (const el of root.querySelectorAll('button, select, label')) {
      if (!visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1) out.add(`clip ${describe(el)}`);
    }
    for (const el of root.querySelectorAll('*')) {
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      );
      if (!ownText || !visible(el)) continue;
      const px = Number.parseFloat(getComputedStyle(el).fontSize);
      if (!scale.has(px)) out.add(`font ${px}px ${describe(el)}`);
    }
    return [...out].sort();
  });
}

const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'design-rules-baseline.json',
);
const baseline: Record<string, string[]> = fs.existsSync(BASELINE_PATH)
  ? (JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string[]>)
  : {};

/**
 * Fails a capture on a design-rule break the baseline does not list, and on a listed one that is gone (a ratchet).
 * `EGA_DESIGN_RULES_UPDATE=1` rewrites this shot's baseline entry instead.
 */
export async function checkDesignRules(page: Page, shotName: string): Promise<void> {
  const found = await designRuleViolations(page);
  if (process.env['EGA_DESIGN_RULES_UPDATE'] === '1') {
    if (found.length > 0) baseline[shotName] = found;
    else delete baseline[shotName];
    const sorted = Object.fromEntries(
      Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)),
    );
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    return;
  }
  const known = new Set(baseline[shotName] ?? []);
  const fresh = found.filter((v) => !known.has(v));
  const fixed = [...known].filter((v) => !found.includes(v));
  const problems = [
    ...fresh.map((v) => `new: ${v}`),
    ...fixed.map((v) => `fixed, remove from design-rules-baseline.json: ${v}`),
  ];
  if (problems.length > 0) {
    throw new Error(
      `${shotName} breaks a design rule. Fix a new one; after a fix, rerun with EGA_DESIGN_RULES_UPDATE=1 to prune the baseline:\n  ${problems.join('\n  ')}`,
    );
  }
}
