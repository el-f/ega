import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { GATE_PREFIX, recordGateKey, recordRefusal } from './design-rules-gate';

// The countable design rules (STANDARDS R9/R16/R17/R20, ui-design-quality.md), checked on the real layout jsdom cannot give.
//
// Baseline keys. screenshot-audit shot names hold what a builder's machine finds: check locally with `pnpm visual:capture`.
// `gate-` keys belong to design-rules.spec.ts, which compares them on Linux only. The CI runner draws DejaVu Sans, 14-22%
// wider than Segoe UI, so another platform finds a different set. Only the CI runner records them: dispatch the "Generate
// Linux E2E Baselines" workflow on the branch (its record step sets EGA_DESIGN_RULES_RECORD=1, which rewrites every gate key),
// download the artifact, copy design-rules-baseline.json into tests/e2e/, run `pnpm format`, review the diff and commit it.
// After the first recording the diff should only remove lines. Record mode refuses to run unless GITHUB_ACTIONS=true and the platform is linux (CI=1 alone is not enough: a WSL or docker shell sets it).

const RECORD = process.env['EGA_DESIGN_RULES_RECORD'] === '1';
const recordRefused = RECORD ? recordRefusal(process.env, process.platform) : null;
if (recordRefused !== null) throw new Error(recordRefused);

/**
 * Ega's own UI on the page: the whole document on an extension page, the shadow root on a web page (never the host page's DOM).
 * Returns one line per broken rule, stable across runs so a baseline can list known debt:
 * - `clip <element>`: a control, tab, option, heading or link whose text is wider than its box, or any text an
 *   ellipsis actually shortens (a span inside a button included). R17: an ellipsis passes only when the cut element
 *   itself carries `data-ega-truncates` (a marker on a container does not count) and the full text is in the
 *   accessible name of the nearest control at or above it (the control its label is for, else the element itself).
 * - `clip-y <element>`: a control whose content is taller than its box.
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
      // Numbers become #: a timing or a count in the text would change the line on every run.
      const text = el.textContent.replace(/\s+/g, ' ').replace(/\d+/g, '#').trim().slice(0, 40);
      return `${tag}${id} "${text}"`;
    };
    // A 1px box is a screen-reader-only label (.ega-sr-only), clipped on purpose.
    const visible = (el: Element): boolean =>
      el.checkVisibility({ visibilityProperty: true, opacityProperty: false }) &&
      el.getBoundingClientRect().width > 1;

    const squash = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
    // Controls hold the name of the text inside them. The roles below are named by their own text.
    const nameHolders =
      'button, a[href], summary, [role="tab"], [role="option"], [role="menuitem"], [role="button"], [role="link"]';
    const nameFromContent = `${nameHolders}, h1, h2, h3, h4, h5, h6, [role="heading"]`;
    // The accessible name in accname order: aria-labelledby, aria-label, native labels, own text, title. Plain text only.
    const accessibleName = (el: Element): string => {
      const scope = el.getRootNode() as Document | ShadowRoot;
      const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
      const labelledBy = ids.map((id) => scope.getElementById(id)?.textContent ?? '').join(' ');
      const labels = [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent);
      return (
        [
          labelledBy,
          el.getAttribute('aria-label'),
          labels.join(' '),
          el.matches(nameFromContent) ? el.textContent : '',
          el.getAttribute('title'),
        ]
          .map(squash)
          .find((name) => name !== '') ?? ''
      );
    };
    const ellipsisCut = (el: Element): boolean =>
      getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    // R17: the cut element has the marker, and the name of its holder (nearest control, else its label's control, else itself) has the whole text.
    const truncationDeclared = (el: Element): boolean => {
      if (!el.hasAttribute('data-ega-truncates')) return false;
      const holder = el.closest(nameHolders) ?? el.closest('label')?.control ?? el;
      return accessibleName(holder).includes(squash(el.textContent));
    };

    const out = new Set<string>();
    const controls =
      'button, select, label, [role="tab"], [role="option"], h1, h2, h3, h4, h5, h6, a';
    for (const el of root.querySelectorAll(controls)) {
      if (!visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1 && !(ellipsisCut(el) && truncationDeclared(el))) {
        out.add(`clip ${describe(el)}`);
      }
      if (el.scrollHeight > el.clientHeight + 1) out.add(`clip-y ${describe(el)}`);
    }
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const style = getComputedStyle(el);
      if (ellipsisCut(el) && !truncationDeclared(el)) out.add(`clip ${describe(el)}`);
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      );
      if (!ownText) continue;
      const px = Number.parseFloat(style.fontSize);
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
 * A soft failure on a design-rule break the baseline does not list, and on a listed one that is gone (a ratchet), so
 * one bad capture does not stop the rest. `EGA_DESIGN_RULES_UPDATE=1` drops the fixed entries instead; it never adds
 * one, so the baseline only shrinks. `EGA_DESIGN_RULES_RECORD=1` (CI runner only) records a `gate-` key instead of checking it.
 */
export async function checkDesignRules(page: Page, shotName: string): Promise<void> {
  const found = await designRuleViolations(page);
  if (RECORD) {
    if (!shotName.startsWith(GATE_PREFIX)) {
      throw new Error(
        `EGA_DESIGN_RULES_RECORD=1 records ${GATE_PREFIX} keys only, not "${shotName}".`,
      );
    }
    recordGateKey(BASELINE_PATH, shotName, found);
    return;
  }
  const known = baseline[shotName] ?? [];
  if (process.env['EGA_DESIGN_RULES_UPDATE'] === '1') {
    const kept = known.filter((v) => found.includes(v));
    if (kept.length > 0) baseline[shotName] = kept;
    else delete baseline[shotName];
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  }
  const fresh = found.filter((v) => !known.includes(v));
  const fixed = known.filter((v) => !found.includes(v));
  const problems = [
    ...fresh.map((v) => `new: ${v}`),
    ...fixed.map((v) => `fixed, remove from design-rules-baseline.json: ${v}`),
  ];
  expect
    .soft(
      process.env['EGA_DESIGN_RULES_UPDATE'] === '1' ? fresh : problems,
      `${shotName} breaks a design rule. Fix a new one; after a fix, rerun with EGA_DESIGN_RULES_UPDATE=1 to prune the baseline`,
    )
    .toEqual([]);
}
