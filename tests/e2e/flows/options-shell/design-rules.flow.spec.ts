/* coverage: options.shell.design-rules */
import fs from 'node:fs';
import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { launchExtension, seedSettings, type ExtensionHandle } from '../../helpers';
import { SETTINGS_TABS } from '../../../../src/shared/settings-tabs';

// Options spec 9.3 (each check names its STANDARDS rule); EGA_DESIGN_RULES_REPORT=<file> records instead of failing.

type Theme = 'light' | 'dark';

let ext: ExtensionHandle;
const found: string[] = [];

test.beforeEach(async () => {
  ext = await launchExtension();
  found.length = 0;
});

test.afterEach(async () => {
  await ext.close();
});

test.setTimeout(420_000);

const SEED = {
  anthropicApiKey: 'sk-ant-design-rules',
  onboardingDismissed: true,
  glossary: [
    { term: 'checkout', translation: 'caja', caseSensitive: false },
    { term: 'cart', translation: 'carrito', caseSensitive: false },
  ],
  sitePrefs: {
    'news.example.com': { disabled: true },
    'shop.example.com': { disabled: false, defaultLang: 'es' },
  },
  advanced: {
    rules: [
      {
        id: 'dr-rule-1',
        body: 'Keep product names in English.',
        category: 'always',
        scope: { tasks: [] },
        source: 'manual',
        addedAt: '2026-10-01T00:00:00.000Z',
        enabled: true,
      },
      {
        id: 'dr-rule-2',
        body: 'Prefer short sentences in summaries.',
        category: 'prefer',
        scope: { tasks: ['summarize'], sites: ['news.example.com'] },
        source: 'manual',
        addedAt: '2026-10-01T00:00:00.000Z',
        enabled: false,
      },
    ],
  },
};

async function openOptions(theme: Theme, width = 1200): Promise<Page> {
  await seedSettings(ext.context, ext.extensionId, { ...SEED, theme });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width, height: 800 });
  // A mount fade caught mid-way reads as low contrast (C-17), and a moving box measures wrong.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.evaluate(async () => {
    const now = Date.now();
    const entry = (id: string, over: Record<string, unknown>) => ({
      id,
      ts: now - 60_000,
      task: 'translate',
      sourceLang: 'es',
      targetLang: 'en',
      backend: 'anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'sys',
      userPrompt: 'hola',
      response: 'hello',
      latencyMs: 410,
      cacheHit: false,
      ...over,
    });
    await chrome.storage.local.set({
      egaAuditLog: {
        version: 1,
        entries: [
          entry('dr-a', {}),
          entry('dr-b', { error: { code: 'AUTH', message: '401 invalid x-api-key' } }),
        ],
      },
    });
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.locator('#tab-translate').waitFor();
  return page;
}

/** The checks that read the rendered page (C-1..C-7, C-10..C-13, C-15). `scope` is the view: a tab panel or a dialog. */
async function staticChecks(page: Page, view: string, scope: string): Promise<void> {
  const out = await page.evaluate(
    ({ scopeSel }) => {
      const scopeEl = document.querySelector(scopeSel);
      if (!scopeEl) return [`scope missing: ${scopeSel}`];
      const res: string[] = [];
      const visible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        return (
          el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
          r.width > 1 &&
          r.height > 1 &&
          el.closest('.ega-sr-only') === null
        );
      };
      const describe = (el: Element): string => {
        const ega = [...el.attributes].find((a) => a.name.startsWith('data-ega-'));
        const tag = el.tagName.toLowerCase();
        const id = ega ? `[${ega.name}${ega.value ? `="${ega.value.slice(0, 30)}"` : ''}]` : '';
        const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 50);
        const name = el.getAttribute('aria-label');
        return `${tag}${id} "${text || (name ?? '')}"`;
      };
      const ownText = (el: Element): string =>
        [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
      const mono = (el: Element): boolean =>
        /mono|consolas|courier|menlo/i.test(getComputedStyle(el).fontFamily);
      // A drawn picture of a web page (the Where answers show mock) is an image, not UI text.
      const textEls = [...scopeEl.querySelectorAll('*')].filter(
        (el) => ownText(el) !== '' && visible(el) && el.closest('[data-ega-illustration]') === null,
      );

      // C-1 (R16, R17, R9): nothing cut off; no ellipsis on words a user must read in full.
      for (const el of scopeEl.querySelectorAll(
        'button, select, label, [role="tab"], h1, h2, h3, [role="option"]',
      )) {
        if (!visible(el)) continue;
        if (el.scrollWidth > el.clientWidth + 1) res.push(`C-1 clip ${describe(el)}`);
      }
      for (const el of scopeEl.querySelectorAll(
        'h1, h2, h3, h4, label, button, [role="option"], [role="alert"], [data-ega-field-error]',
      )) {
        if (!visible(el) || el.closest('[data-ega-truncates]')) continue;
        if (getComputedStyle(el).textOverflow === 'ellipsis')
          res.push(`C-1 ellipsis ${describe(el)}`);
      }

      // C-2 (R18, R20): at most three text sizes in a view; nothing under 12px.
      const sizes = new Map<number, string>();
      for (const el of textEls) {
        if (mono(el)) continue;
        const px = Number.parseFloat(getComputedStyle(el).fontSize);
        if (!sizes.has(px)) sizes.set(px, describe(el));
        if (px < 12) res.push(`C-2 under 12px (${px}px) ${describe(el)}`);
      }
      if (sizes.size > 3)
        res.push(
          `C-2 ${sizes.size} text sizes: ${[...sizes.entries()]
            .sort(([a], [b]) => a - b)
            .map(([px, d]) => `${px}px ${d}`)
            .join(' | ')}`,
        );

      // C-3 (R19) and C-4 (R23).
      for (const el of textEls) {
        const cs = getComputedStyle(el);
        if (cs.fontWeight !== '400' && cs.fontWeight !== '600')
          res.push(`C-3 weight ${cs.fontWeight} ${describe(el)}`);
        if (cs.textTransform === 'uppercase') res.push(`C-4 uppercase ${describe(el)}`);
      }

      // C-5 (R12, R61): a tab or card description is one line, at most 90 characters, no final full stop.
      for (const el of scopeEl.querySelectorAll('.tab-desc, .ega-section-card-desc')) {
        if (!visible(el)) continue;
        const text = el.textContent.trim();
        const lh = Number.parseFloat(getComputedStyle(el).lineHeight);
        const lines = Number.isFinite(lh) ? Math.round(el.getBoundingClientRect().height / lh) : 1;
        if (lines > 1) res.push(`C-5 ${lines} lines ${describe(el)}`);
        if (text.length > 90) res.push(`C-5 ${text.length} chars ${describe(el)}`);
        if (/\.$/.test(text)) res.push(`C-5 full stop ${describe(el)}`);
      }

      // C-6 (R24): one filled primary per view; the red fill only on Delete all data.
      const primaries = [...scopeEl.querySelectorAll('[data-variant="primary"]')].filter(visible);
      if (primaries.length > 1)
        res.push(`C-6 ${primaries.length} primary buttons: ${primaries.map(describe).join(' | ')}`);
      for (const el of scopeEl.querySelectorAll('[data-variant="danger"]')) {
        if (visible(el) && el.textContent.trim() !== 'Delete all data')
          res.push(`C-6 danger fill ${describe(el)}`);
      }

      // C-7 (R37): a control that does nothing says why on screen; an end arrow in a K-10 toolbar names it instead.
      for (const el of scopeEl.querySelectorAll(
        '[aria-disabled="true"], button:disabled, input:disabled, select:disabled, textarea:disabled',
      )) {
        if (!visible(el) || el.closest('[role="toolbar"]') !== null) continue;
        const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
        const shown = ids
          .map((i) => document.getElementById(i))
          .some((d) => d !== null && visible(d) && d.textContent.trim() !== '');
        if (!shown) res.push(`C-7 no visible reason ${describe(el)}`);
      }

      // C-10 (R40): a hint is one sentence, no final full stop, no link.
      for (const el of scopeEl.querySelectorAll('[data-ega-hint]')) {
        if (!visible(el)) continue;
        const text = el.textContent.trim();
        if (/[.!?]\s+\S/.test(text)) res.push(`C-10 more than one sentence ${describe(el)}`);
        if (/\.$/.test(text)) res.push(`C-10 full stop ${describe(el)}`);
        if (el.querySelector('a')) res.push(`C-10 link ${describe(el)}`);
      }

      // C-11 (R25): no box in a box in a box.
      const boxed = (el: Element): boolean => {
        const cs = getComputedStyle(el);
        return ['Top', 'Right', 'Bottom', 'Left'].every((side) => {
          const w = Number.parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`));
          const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
          const color = cs.getPropertyValue(`border-${side.toLowerCase()}-color`);
          return w > 0 && style !== 'none' && !/rgba\([^)]*,\s*0\)|transparent/.test(color);
        });
      };
      for (const el of textEls) {
        let n = 0;
        for (let a = el.parentElement; a !== null; a = a.parentElement) if (boxed(a)) n++;
        if (n > 2) res.push(`C-11 ${n} bordered ancestors ${describe(el)}`);
      }

      // C-12 (R8): the buttons of a list row sit on one line.
      for (const li of scopeEl.querySelectorAll('li')) {
        if (!visible(li)) continue;
        const own = [...li.querySelectorAll('button')].filter(
          (b) =>
            visible(b) && b.closest('li') === li && b.closest('details, [role="dialog"]') === null,
        );
        const tops = new Set(own.map((b) => Math.round(b.getBoundingClientRect().top / 4)));
        if (tops.size > 1) res.push(`C-12 ${tops.size} button rows ${describe(li)}`);
      }

      // C-13 (R44): every target is at least 24 x 24; a checkbox or radio counts its label, which takes the click.
      for (const el of scopeEl.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="option"], [role="button"], [role="checkbox"], [role="radio"], [role="switch"]',
      )) {
        if (!visible(el)) continue;
        if (el.tagName === 'A' && el.closest('p, li, dd') !== null) continue; // inline text link
        const box = el.getBoundingClientRect();
        let w = box.width;
        let h = box.height;
        const toggle =
          (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) ||
          ['radio', 'checkbox', 'switch'].includes(el.getAttribute('role') ?? '');
        const label = toggle
          ? (el.closest('label') ??
            (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null))
          : null;
        if (label) {
          const lr = label.getBoundingClientRect();
          w = Math.max(w, lr.width);
          h = Math.max(h, lr.height);
        }
        if (w < 23.5 || h < 23.5)
          res.push(`C-13 ${Math.round(w)}x${Math.round(h)} ${describe(el)}`);
      }

      // C-15 (R5): no internal id or error code in words a user reads.
      const ALLOW = new Set([
        'API',
        'JSON',
        'URL',
        'HTTP',
        'HTTPS',
        'MIT',
        'DELETE',
        'EXPORT',
        'KEYS',
        'PATH',
        'NOTE',
        'CLI',
        'OCR',
        'LLM',
      ]);
      const ALLOW_CAMEL = new Set(['xAI', 'macOS', 'iPhone']);
      for (const el of textEls) {
        if (mono(el) || el.closest('details, code, pre, kbd, [data-ega-tech-details]')) continue;
        const text = ownText(el);
        for (const m of text.matchAll(/\b[a-z]+[A-Z][A-Za-z]+\b/g))
          if (!ALLOW_CAMEL.has(m[0])) res.push(`C-15 id "${m[0]}" ${describe(el)}`);
        for (const m of text.matchAll(/\b[A-Z_]{4,}\b/g))
          if (!ALLOW.has(m[0])) res.push(`C-15 code "${m[0]}" ${describe(el)}`);
      }
      return res;
    },
    { scopeSel: scope },
  );
  for (const v of out) found.push(`${view}: ${v}`);
}

/** C-8 (R31): each (i) is named "About ...", opens on focus, closes on Esc, and holds only text. */
async function infoTipChecks(page: Page, view: string, scope: string): Promise<void> {
  const tips = page.locator(`${scope} [data-ega-infotip]`);
  const n = await tips.count();
  for (let i = 0; i < n; i++) {
    const tip = tips.nth(i);
    if (!(await tip.isVisible())) continue;
    const name = (await tip.getAttribute('aria-label')) ?? '';
    if (!name.startsWith('About')) found.push(`${view}: C-8 name "${name}"`);
    await tip.focus();
    const text = page.locator('[data-ega-infotip-text]');
    if (!(await text.isVisible().catch(() => false))) {
      await text.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
    }
    if (!(await text.isVisible())) {
      found.push(`${view}: C-8 focus does not open "${name}"`);
      continue;
    }
    if ((await text.locator('a, button').count()) > 0)
      found.push(`${view}: C-8 link or button inside "${name}"`);
    await page.keyboard.press('Escape');
    if (!(await text.isHidden())) {
      await text.waitFor({ state: 'hidden', timeout: 1_500 }).catch(() => undefined);
      if (!(await text.isHidden())) found.push(`${view}: C-8 Esc does not close "${name}"`);
    }
  }
}

/** C-17: the axe scan, critical and serious only, on the settled page. */
async function axeCheck(page: Page, view: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  for (const v of results.violations) {
    if (v.impact !== 'critical' && v.impact !== 'serious') continue;
    const where = v.nodes
      .slice(0, 3)
      .map((n) => (Array.isArray(n.target) ? n.target.join(' > ') : String(n.target)))
      .join(' | ');
    found.push(`${view}: C-17 ${v.id} (${v.impact}) ${where}`);
  }
}

/** Every tab, and every Advanced sub-tab. */
async function eachView(page: Page, run: (view: string) => Promise<void>): Promise<void> {
  for (const { id } of SETTINGS_TABS) {
    await page.locator(`#tab-${id}`).click();
    // The rail's hover label would be measured as part of the tab button.
    await page.mouse.move(5, 795);
    await page.locator(`#tabpanel-${id}`).waitFor();
    await page.waitForTimeout(150); // wait for lazy tab chunks and first reads (no single end state)
    if (id === 'advanced') {
      for (const sub of ['data', 'diagnostics']) {
        await page.locator(`[data-ega-subtab="${sub}"]`).click();
        await page.mouse.move(5, 795);
        await page.locator(`#adv-pane-${sub}`).waitFor();
        await page.waitForTimeout(150); // wait for the pane's storage reads (no single end state)
        await run(`advanced/${sub}`);
      }
    } else {
      await run(id);
    }
  }
}

/** The dialogs a user meets: every task, a new task, a language, a new language, Delete all data, search. */
async function eachDialog(
  page: Page,
  run: (view: string, dialog: Locator) => Promise<void>,
): Promise<void> {
  const open = async (view: string, trigger: () => Promise<void>): Promise<void> => {
    await trigger();
    const dialog = page.locator('.ega-dialog').last();
    await dialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(150); // wait for the dialog's first reads (no single end state)
    await run(view, dialog);
    await page.keyboard.press('Escape');
    // A dialog with an unsaved draft asks first; leave it without saving.
    const discard = page.getByRole('button', { name: /^(Discard|Close without saving)/ });
    if (await discard.isVisible().catch(() => false)) await discard.click();
    await expect(page.locator('.ega-dialog')).toHaveCount(0);
    // C-14 (R11): closing a dialog hands focus back, never to the page body.
    const onBody = await page.evaluate(() => document.activeElement === document.body);
    if (onBody) found.push(`${view}: C-14 focus on body after close`);
  };

  await page.locator('#tab-tasks').click();
  for (const id of [
    'translate',
    'explain',
    'summarize',
    'reword',
    'grammar',
    'suggest-replies',
    'ask',
  ]) {
    await open(`task-dialog/${id}`, () => page.locator(`[data-ega-task-edit="${id}"]`).click());
  }
  await open('task-dialog/new', () =>
    page
      .getByRole('button', { name: /^New task$/ })
      .first()
      .click(),
  );

  await page.locator('#tab-languages').click();
  await open('language-dialog/arabizi', () =>
    page.locator('[data-ega-variety-edit="arabizi"]').click(),
  );
  await open('language-dialog/new', () => page.locator('[data-ega-language-add]').click());

  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="data"]').click();
  await open('delete-all-data', () => page.locator('[data-ega-delete-all]').click());

  await open('settings-search', () => page.keyboard.press('Control+,'));
}

/** C-9 (section 5.0): scrolled to the end, the last line clears the footer; while more is below, the cue shows. */
async function dialogScrollCheck(view: string, dialog: Locator): Promise<void> {
  const res = await dialog.evaluate((d) => {
    const body = d.querySelector<HTMLElement>('.ega-dialog-body');
    const actions = d.querySelector<HTMLElement>('.ega-dialog-actions');
    if (!body) return [];
    const out: string[] = [];
    const scrolls = body.scrollHeight > body.clientHeight + 1;
    if (scrolls && body.scrollTop === 0 && !d.querySelector('.cue-bottom'))
      out.push('C-9 no scroll cue while more is below');
    body.scrollTop = body.scrollHeight;
    body.dispatchEvent(new Event('scroll'));
    const content = body.firstElementChild;
    const last = content?.lastElementChild ?? content;
    if (last && actions) {
      const gap = actions.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
      if (gap < -1) out.push(`C-9 last body line ${Math.round(-gap)}px under the footer`);
    }
    return out;
  });
  for (const v of res) found.push(`${view}: ${v}`);
}

function settle(label: string): void {
  const report = process.env['EGA_DESIGN_RULES_REPORT'];
  if (report) {
    const prior: Record<string, string[]> = fs.existsSync(report)
      ? (JSON.parse(fs.readFileSync(report, 'utf8')) as Record<string, string[]>)
      : {};
    prior[label] = [...found];
    fs.writeFileSync(report, `${JSON.stringify(prior, null, 2)}\n`);
    return;
  }
  expect(found, found.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`every tab and sub-tab follows the design rules (${theme})`, async () => {
    const page = await openOptions(theme);
    await eachView(page, async (view) => {
      await staticChecks(page, `${theme} ${view}`, '.options-content');
      await infoTipChecks(page, `${theme} ${view}`, '.options-content');
      await axeCheck(page, `${theme} ${view}`);
    });
    settle(`tabs-${theme}`);
  });

  test(`every dialog follows the design rules (${theme})`, async () => {
    const page = await openOptions(theme);
    await eachDialog(page, async (view, dialog) => {
      const label = `${theme} ${view}`;
      await staticChecks(page, label, '.ega-dialog');
      await dialogScrollCheck(label, dialog);
      await axeCheck(page, label);
    });
    settle(`dialogs-${theme}`);
  });
}

test('nothing is cut off at 880px and 600px (C-1)', async () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [880, 600]) {
      const page = await openOptions(theme, width);
      await eachView(page, async (view) => {
        const clips = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll(
            'button, select, label, [role="tab"], h1, h2, h3, [role="option"]',
          )) {
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || el.closest('.ega-sr-only') || !el.checkVisibility()) continue;
            if (el.scrollWidth > el.clientWidth + 1)
              out.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}"`);
          }
          return out;
        });
        for (const c of clips) found.push(`${theme} ${width}px ${view}: C-1 clip ${c}`);
      });
      await page.close();
    }
  }
  settle('narrow');
});

test('the shortcut sheet stays inside a short window and scrolls to its last line (C-1)', async () => {
  const page = await openOptions('light');
  await page.setViewportSize({ width: 1200, height: 360 });
  await page.locator('body').press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  if (box === null || box.y < 0 || box.y + box.height > 360)
    found.push(`C-1 shortcut sheet outside the window: ${JSON.stringify(box)}`);
  const last = sheet.locator('.shortcut-foot').last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  if (lastBox === null || lastBox.y + lastBox.height > 360)
    found.push(`C-1 last shortcut line below the window: ${JSON.stringify(lastBox)}`);
  settle('shortcut-sheet');
});

test('focus never falls to the page body after a tab switch, delete, Undo or reset (C-14)', async () => {
  const page = await openOptions('light');
  const onBody = (): Promise<boolean> =>
    page.evaluate(
      () => document.activeElement === null || document.activeElement === document.body,
    );

  await page.locator('#tab-glossary').click();
  if (await onBody()) found.push('tab switch: C-14 focus on body');

  // Delete a glossary entry: focus moves to a neighbour, not the body.
  await page.getByRole('button', { name: 'Edit entry checkout' }).click();
  await page.getByRole('button', { name: 'Delete entry checkout' }).click();
  if (await onBody()) found.push('glossary delete: C-14 focus on body');

  // Undo from the toast puts the entry back and keeps focus on the page.
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(150); // wait for the toast to leave (no single end state)
  if (await onBody()) found.push('toast Undo: C-14 focus on body');

  // A section reset hides its own button; focus must land somewhere real.
  await page.locator('#tab-advanced').click();
  await page.locator('[data-ega-subtab="diagnostics"]').click();
  await page.locator('#adv-log-level').selectOption('debug');
  const reset = page.locator('#adv-pane-diagnostics [data-ega-section-reset]');
  await reset.click();
  await expect(reset).toHaveCount(0);
  if (await onBody()) found.push('section reset: C-14 focus on body');

  // Reset prompt and model settings, then its Undo.
  await page.locator('[data-ega-subtab="data"]').click();
  await page.locator('[data-ega-reset-defaults]').click();
  if (await onBody()) found.push('reset: C-14 focus on body');
  settle('focus');
});

test('the First choice row is the first ready backend (C-16)', async () => {
  // Gemini sits first but has no key; Anthropic is the first row that can answer.
  await seedSettings(ext.context, ext.extensionId, {
    ...SEED,
    theme: 'light',
    backendOrder: ['gemini', 'anthropic', 'native'],
    disabledBackends: [],
  });
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await page.locator('#tab-backends').click();
  await expect(page.locator('[data-ega-route="first"]')).toHaveCount(1, { timeout: 10_000 });
  const rows = await page.locator('[data-be-row-id]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-be-row-id'),
      status: el
        .querySelector('[data-ega-backend-status]')
        ?.getAttribute('data-ega-backend-status'),
      first: el.querySelector('[data-ega-route="first"]') !== null,
    })),
  );
  const READY = new Set(['Key saved', 'Verified', 'Installed', 'Update needed', 'Running']);
  const firstReady = rows.find((r) => READY.has(r.status ?? ''));
  const marked = rows.find((r) => r.first);
  if (firstReady?.id !== marked?.id)
    found.push(`C-16 First choice on ${marked?.id}, first ready row is ${firstReady?.id}`);
  expect(marked?.id).toBe('anthropic');
  settle('first-choice');
});

test('the checks see a planted break of each rule they read off the page', async () => {
  const page = await openOptions('light');
  await page.evaluate(() => {
    const box = document.createElement('section');
    box.setAttribute('data-ega-probe', '');
    box.innerHTML = [
      '<button style="width:40px;overflow:hidden;white-space:nowrap">Translate this page</button>',
      '<span style="font-size:11px">Tiny</span>',
      '<span style="font-size:17px">Odd</span><span style="font-size:19px">Odd too</span>',
      '<span style="font-weight:500">Medium</span>',
      '<span style="text-transform:uppercase">Shout</span>',
      '<p class="ega-section-card-desc">A description that ends with a stop.</p>',
      '<button data-variant="primary" style="width:80px;height:30px">One</button>',
      '<button data-variant="primary" style="width:80px;height:30px">Two</button>',
      '<button aria-disabled="true" style="width:80px;height:30px">Off</button>',
      '<p data-ega-hint>First sentence. Second one</p>',
      '<div style="border:1px solid red"><div style="border:1px solid red"><div style="border:1px solid red"><span>Deep</span></div></div></div>',
      '<ul><li><button style="width:30px;height:30px">A</button><br><button style="width:30px;height:30px">B</button></li></ul>',
      '<button style="width:16px;height:16px;padding:0" aria-label="Tiny target"></button>',
      '<span>The fallbackDepth is set; code RATE_LIMIT</span>',
    ].join('');
    document.body.prepend(box);
  });
  await staticChecks(page, 'probe', '[data-ega-probe]');
  for (const rule of [
    'C-1',
    'C-2',
    'C-3',
    'C-4',
    'C-5',
    'C-6',
    'C-7',
    'C-10',
    'C-11',
    'C-12',
    'C-13',
    'C-15',
  ]) {
    expect(
      found.some((f) => f.startsWith(`probe: ${rule} `)),
      `${rule} did not fire:\n${found.join('\n')}`,
    ).toBe(true);
  }
});
