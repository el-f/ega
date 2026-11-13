import { test, expect, type Page } from '@playwright/test';
import {
  launchExtension,
  mockAnthropic,
  seedSettings,
  selectArabiziParagraph,
  waitForTestHooks,
  type ExtensionHandle,
  resetRoutes,
} from './helpers';
import { FOLLOW_FIXTURE_SCRIPT, openExampleTab } from './sidepanel-audit';
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
  smartBubbleBannerShown: true,
};

type Clip = { x: number; y: number; width: number; height: number };

/** CSS px from just above the Arabizi post to just under its tooltip: both README hero shots use this one strip. */
const HERO_STRIP_HEIGHT = 250;

async function save(page: Page, name: string, clip?: Clip): Promise<void> {
  await page.mouse.move(0, 2000);
  await page.waitForTimeout(60); // wait for hover styles to settle (no observable end state)
  await page.screenshot({ path: path.join(MEDIA_DIR, `${name}.png`), ...(clip ? { clip } : {}) });
}

test('README — bubble on a selection, then the tooltip it opens', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, READY_SEED);
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, {
    translation: ARABIZI_ANSWER,
    confidence: 0.96,
    ...ARABIZI_DETECTED,
  });

  const page = await ext.context.newPage();
  // Narrow, so the posts wrap inside the strip instead of running off its edge.
  await page.setViewportSize({ width: 520, height: 800 });
  await page.goto(`${ext.serverUrl}/showcase-page.html`);
  await waitForTestHooks(page);
  await page.locator('body').focus();
  await selectArabiziParagraph(page);
  const bubble = page.locator('#ega-shadow-host .bubble');
  await expect(bubble).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(200); // wait for the bubble's 120 ms pop animation (no observable end state)
  const strip = await page.evaluate((height) => {
    const post = document.getElementById('arabizi')?.closest('article');
    const main = document.querySelector('main');
    if (!post || !main) return null;
    const m = main.getBoundingClientRect();
    return { x: m.left, y: post.getBoundingClientRect().top - 12, width: m.width, height };
  }, HERO_STRIP_HEIGHT);
  if (!strip) throw new Error('Arabizi post not found');
  const inStrip = (box: { left: number; right: number; bottom: number }): boolean =>
    box.left >= strip.x &&
    box.right <= strip.x + strip.width &&
    box.bottom + 8 <= strip.y + strip.height;
  const bubbleBox = await bubble.boundingBox();
  if (!bubbleBox) throw new Error('bubble has no box — refusing to ship a shot without it');
  const bubbleEdges = {
    left: bubbleBox.x,
    right: bubbleBox.x + bubbleBox.width,
    bottom: bubbleBox.y + bubbleBox.height,
  };
  if (!inStrip(bubbleEdges)) throw new Error('the bubble is outside the hero strip');
  await save(page, 'bubble', strip);

  await bubble.click();
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

  const card = await page.evaluate(() => {
    const host = document.querySelector('#ega-shadow-host');
    const r = (host as HTMLElement | null)?.shadowRoot
      ?.querySelector('.tooltip')
      ?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, bottom: r.bottom } : null;
  });
  if (!card) throw new Error('tooltip card not found — refusing to ship a shot without it');
  if (!inStrip(card)) {
    throw new Error(
      `the tooltip (${JSON.stringify(card)}) is outside the hero strip; HERO_STRIP_HEIGHT needs ${Math.ceil(card.bottom + 16 - strip.y)}`,
    );
  }
  await save(page, 'tooltip', strip);
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
  // The panel follows a page beside it, so the header names a site instead of "Other pages".
  await ext.context.addInitScript(FOLLOW_FIXTURE_SCRIPT);
  await openExampleTab(ext.context);
  const sp = await ext.context.newPage();
  await sp.setViewportSize({ width: 400, height: 520 });
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
    await sp.locator('#sp-text').press('Enter');
    await sp
      .locator('.ega-answer')
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
  await sp.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await save(sp, 'sidepanel');
});

test('README — Backends tab with configured providers', async () => {
  test.slow();
  await seedSettings(ext.context, ext.extensionId, READY_SEED);
  await resetRoutes(ext.context);
  mockAnthropic(ext.context, { translation: 'Hello, how are you?' });
  // A green Ollama dot on every machine, not only where a daemon happens to run.
  await ext.context.route('http://localhost:11434/api/tags', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[]}' }),
  );
  const opts = await ext.context.newPage();
  await opts.setViewportSize({ width: 1180, height: 900 });
  await opts.goto(`chrome-extension://${ext.extensionId}/src/options/index.html`);
  await opts.waitForLoadState('networkidle');
  await opts.locator('#tab-backends').click();
  // A passed Test is what a set-up user has seen, so the first choice reads Verified, not Key saved.
  const anthropic = opts.locator('details[data-backend-id="anthropic"]');
  await anthropic.locator('summary').click();
  await opts.getByTestId('backend-card-test-anthropic').click();
  await expect(anthropic.locator('[data-ega-backend-status]')).toHaveAttribute(
    'data-ega-backend-status',
    'Verified',
    { timeout: 15_000 },
  );
  await opts.reload();
  await opts.locator('#tab-backends').click();
  await expect(anthropic.locator('[data-ega-backend-status]')).toHaveAttribute(
    'data-ega-backend-status',
    'Verified',
    { timeout: 5_000 },
  );
  // Long enough for every card's isAvailable probe to settle, so no pill is left mid-probe.
  await opts.waitForTimeout(2500);
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
