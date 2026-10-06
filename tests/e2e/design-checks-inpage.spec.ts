import { test, expect, type Page } from '@playwright/test';
import {
  egaTest,
  launchExtension,
  onlyBackends,
  seedSettings,
  waitForTestHooks,
  type ExtensionHandle,
} from './helpers';

// DOM probes for the rules of the page-popup redesign that a machine can count; each one fails the build.

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, {
    anthropicApiKey: 'sk-test',
    ...onlyBackends('anthropic'),
    bubbleFirstRunSeen: true,
    cacheEnabled: false,
  });
});

test.afterEach(async () => {
  await ext.close();
});

/** Every visible control and text node in a root, measured. */
async function probe(
  page: Page,
  inShadow: boolean,
): Promise<{
  smallText: string[];
  smallTargets: string[];
  titles: string[];
  disabledInToolbars: number;
}> {
  return page.evaluate((shadow) => {
    const root: ParentNode = shadow
      ? (document.getElementById('ega-shadow-host')?.shadowRoot ?? document)
      : document;
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const smallText: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (!visible(el) || el.closest('.ega-sr-only, [aria-hidden="true"]')) continue;
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== '',
      );
      if (own && Number.parseFloat(getComputedStyle(el).fontSize) < 12) {
        smallText.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    const smallTargets = [...root.querySelectorAll<HTMLElement>('button, a[href], [role="switch"]')]
      // The backend chip belongs to the shared header (side panel slice); it is reported there.
      .filter((el) => visible(el) && !el.closest('.ega-sr-only, .active-backend-chip'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      })
      .map((el) => el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30));
    const titles = [...root.querySelectorAll('[title]')].map((el) => el.tagName.toLowerCase());
    const disabledInToolbars = root.querySelectorAll('[role="toolbar"] [disabled]').length;
    return { smallText, smallTargets, titles, disabledInToolbars };
  }, inShadow);
}

test('popup: one filled primary, one-line tools, a one-stop toolbar, no small text or targets', async () => {
  const popup = await ext.context.newPage();
  await popup.addInitScript(() => {
    const g = globalThis as unknown as {
      chrome: { tabs: { query: unknown; sendMessage: unknown } };
    };
    g.chrome.tabs.query = async () => [{ id: 7, url: 'https://example.com/', windowId: 1 }];
    g.chrome.tabs.sendMessage = async () => ({
      text: 'hi',
      heldBack: { reason: 'english' },
    });
  });
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.getByRole('button', { name: 'Translate anyway' }).waitFor();

  // One filled primary: buttons painted with the accent color.
  const filled = await popup.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.background = 'var(--color-accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll('button')].filter(
      (b) => getComputedStyle(b).backgroundColor === accent,
    ).length;
  });
  expect(filled).toBe(1);

  const toolRows = await popup.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-ega-popup-tools] button')].map((b) => ({
      oneLine: b.getBoundingClientRect().height <= 40,
      tab: b.tabIndex,
    })),
  );
  expect(toolRows.every((r) => r.oneLine)).toBe(true);
  expect(toolRows.filter((r) => r.tab === 0)).toHaveLength(1);

  const p = await probe(popup, false);
  expect(p.smallText).toEqual([]);
  expect(p.smallTargets).toEqual([]);
  expect(p.titles).toEqual([]);
  expect(p.disabledInToolbars).toBe(0);
});

test('bubble and picker bar: 12px floor, 24px targets, the bubble named by its label', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/batch-page.html`);
  await waitForTestHooks(page);
  await page.evaluate(() => {
    const el = document.getElementById('c1') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  });
  await expect.poll(async () => egaTest<number>(page, 'bubbleCount')).toBe(1);
  const named = await page.evaluate(() => {
    const b = document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.bubble');
    return { label: b?.textContent.trim(), aria: b?.getAttribute('aria-label') ?? null };
  });
  expect(named).toEqual({ label: 'Translate to English', aria: null });
  let p = await probe(page, true);
  expect(p.smallText).toEqual([]);
  expect(p.smallTargets).toEqual([]);
  expect(p.titles).toEqual([]);

  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:chooseAreas' });
  });
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  p = await probe(page, true);
  expect(p.smallText).toEqual([]);
  expect(p.smallTargets).toEqual([]);
  expect(p.disabledInToolbars).toBe(0);
});

test('page chips keep their own font and a 24px button on a hostile page', async () => {
  await ext.context.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"upstream exploded"}',
    }),
  );
  const page = await ext.context.newPage();
  await page.goto(`${ext.serverUrl}/hostile-page.html`);
  await waitForTestHooks(page);
  const sw = ext.context.serviceWorkers()[0];
  await sw?.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { kind: 'page:chooseAreas' });
  });
  await expect.poll(async () => egaTest<boolean>(page, 'msIsActive')).toBe(true);
  expect(await egaTest<boolean>(page, 'msSelectById', 'c1')).toBe(true);
  expect(await egaTest<boolean>(page, 'msFire')).toBe(true);
  const chip = page.locator('[data-ega-tx-error]').first();
  await chip.waitFor({ timeout: 30_000 });
  const look = await chip.evaluate((host) => {
    const root = host.shadowRoot;
    const c = root?.querySelector('.chip') as HTMLElement;
    const btn = root?.querySelector('button') as HTMLElement | null;
    const s = getComputedStyle(c);
    return {
      font: s.fontFamily,
      size: s.fontSize,
      text: c.textContent,
      button: btn?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(look.font.startsWith('system-ui')).toBe(true);
  expect(look.size).toBe('12px');
  expect(look.button).toBeGreaterThanOrEqual(24);
  // The catalog title, never the provider's status or words.
  expect(look.text).not.toMatch(/\b[1-5]\d\d\b|HTTP|upstream|[A-Z]{2,}_[A-Z]+/);
});
