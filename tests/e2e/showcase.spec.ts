import { test, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
  resetRoutes,
} from './helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(__dirname, '..', '..', 'docs', 'media');

// The README ships these, so every shot seeds a configured backend — never a fresh install.
let ext: ExtensionHandle;

test.beforeAll(async () => {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  ext = await launchExtension({ deviceScaleFactor: 2, colorScheme: 'dark' });
});

test.afterAll(async () => {
  await ext.close();
});

test.afterEach(async () => {
  for (const page of ext.context.pages().slice(1)) {
    await page.close().catch(() => undefined);
  }
});

/** A faithful English rendering of the fixture's `mar7aba, kifak? shu 3am ta3mel?`. */
const ARABIZI_ANSWER = 'Hi, how are you? What are you up to?';
/** What a real model reports for that line, so the shots show the detected-language pill. */
const ARABIZI_DETECTED = { detectedLang: 'arabizi', detectedDetail: 'Levantine' };

/** Configured, onboarded, healthy — the state a real user is in after setup. */
const READY_SEED = {
  theme: 'dark' as const,
  anthropicApiKey: 'sk-ant-showcase',
  openaiApiKey: 'sk-showcase',
  geminiApiKey: 'AIza-showcase',
  disabledBackends: [
    'native',
    'ollama',
    'groq',
    'deepseek',
    'together',
    'mistral',
    'xai',
    'fireworks',
    'openrouter',
  ],
  onboardingDismissed: true,
  confidencePill: true,
  captureResultMeta: true,
  contextEnabled: true,
  streaming: true,
  defaultDisplayMode: 'tooltip' as const,
  bubbleMode: 'never' as const,
  smartBubbleBannerShown: true,
};

type Clip = { x: number; y: number; width: number; height: number };

async function save(page: Page, name: string, clip?: Clip): Promise<void> {
  await page.mouse.move(0, 2000);
  await page.waitForTimeout(60); // wait for hover styles to settle (no observable end state)
  await page.screenshot({ path: path.join(MEDIA_DIR, `${name}.png`), ...(clip ? { clip } : {}) });
}

test('README — tooltip answering on a page', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, READY_SEED);
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, {
    translation: ARABIZI_ANSWER,
    confidence: 0.96,
    ...ARABIZI_DETECTED,
  });

  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto(`${ext.serverUrl}/showcase-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  await page.keyboard.press('Control+Shift+L');
  await page.waitForFunction(
    (needle) => {
      const host = document.querySelector('#ega-shadow-host');
      const body = (host as HTMLElement | null)?.shadowRoot?.querySelector('.tooltip .body');
      return !!body && body.textContent.includes(needle);
    },
    ARABIZI_ANSWER,
    { timeout: 15_000, polling: 200 },
  );
  await page.waitForTimeout(350); // wait for the tooltip entrance animation (no observable end state)

  const clip = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const card = (host as HTMLElement | null)?.shadowRoot?.querySelector('.tooltip');
    const main = document.querySelector('main');
    if (!card || !main) return null;
    const a = card.getBoundingClientRect();
    const b = main.getBoundingClientRect();
    const left = Math.max(0, Math.min(a.left, b.left));
    const right = Math.min(window.innerWidth, Math.max(a.right, b.right));
    const bottom = Math.min(window.innerHeight, Math.max(a.bottom + 24, b.top + 320));
    return { x: left, y: 0, width: right - left, height: bottom };
  });
  if (!clip) throw new Error('tooltip card not found — refusing to ship a shot without it');
  await save(page, 'tooltip', clip);
});

test('README — popup with a live backend', async () => {
  await seedSettings(ext.context, ext.extensionId, READY_SEED);
  const popup = await ext.context.newPage();
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(`chrome-extension://${ext.extensionId}/src/popup/index.html`);
  await popup.waitForLoadState('networkidle');
  await popup.waitForTimeout(700); // wait for SW init + backend chip probe to settle
  const body = await popup.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { width: Math.floor(r.width), height: Math.ceil(r.height) };
  });
  await save(popup, 'popup', { x: 0, y: 0, ...body });
});

test('README — side panel holding a conversation', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, READY_SEED);
  const sp = await ext.context.newPage();
  await sp.setViewportSize({ width: 400, height: 1000 });
  await sp.goto(`chrome-extension://${ext.extensionId}/src/sidepanel/index.html`);
  await sp.waitForLoadState('networkidle');
  await sp.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith('ega:conv:'));
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  });
  await sp.reload();
  await sp.waitForTimeout(500); // wait for Svelte mount after reload

  const turns: [string, string, { detectedLang: string; detectedDetail?: string }][] = [
    ['mar7aba, kifak? shu 3am ta3mel?', ARABIZI_ANSWER, ARABIZI_DETECTED],
    [
      'ngl this update is lowkey bussin',
      'Honestly, this update is really good.',
      { detectedLang: 'genz-slang' },
    ],
  ];
  for (const [source, answer, detected] of turns) {
    await resetRoutes(ext.context);
    mockAnthropic(ext.context, { translation: answer, confidence: 0.95, times: 1, ...detected });
    await sp.locator('#sp-text').fill(source);
    await sp.getByRole('button', { name: /^Translate$/ }).click();
    await sp
      .locator('.ega-assistant-body')
      .filter({ hasText: answer.slice(0, 12) })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 });
  }
  await sp.waitForTimeout(500); // wait for the post-stream chip strip to mount
  await sp.evaluate(() => {
    const el = document.querySelector('.ega-conv-stream');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await sp.waitForTimeout(200); // wait for smooth-scroll settle
  await save(sp, 'sidepanel');
});

test('README — Backends tab with configured providers', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, READY_SEED);
  // A green Ollama dot on every machine, not only where a daemon happens to run.
  await ext.context.route('http://localhost:11434/api/tags', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[]}' }),
  );
  const opts = await ext.context.newPage();
  await opts.setViewportSize({ width: 1180, height: 900 });
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await opts.waitForLoadState('networkidle');
  await opts.locator('#tab-backends').click();
  // Long enough for every card's isAvailable probe to settle, so no pill is left mid-probe.
  await opts.waitForTimeout(2500);
  await opts.locator('[data-backend-id="anthropic"]').first().waitFor({ state: 'visible' });
  // End the shot on a whole row: the three active providers and the first three available ones.
  const bottom = await opts.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-backend-id]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .sort((a, b) => a.top - b.top);
    const last = rows[Math.min(rows.length, 6) - 1];
    return last ? last.bottom + 6 : window.innerHeight;
  });
  await save(opts, 'backends', {
    x: 0,
    y: 0,
    width: 1180,
    height: Math.min(900, Math.ceil(bottom)),
  });
});
