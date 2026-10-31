// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings } from '@tests/_helpers/router';
import { STORAGE_KEYS } from '@/shared/constants';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { TranslationBackend } from '@/shared/backends/base';
import type { Settings } from '@/shared/types';
import type { CustomTask } from '@/shared/settings-schema';
import { createRouter } from '@/background/router';
import { dispatchImageTranslate } from '@/background/imageTranslateDispatch';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';

// Content script, worker dispatcher, router and backend are all real here; only the browser's message hops are mocked.

await import('@/content/index');

const IMG = 'https://shop.example.com/img/label.png';
const TITLE = 'Oat drink 1 L, no added sugar';

const labelCheck: CustomTask = {
  id: 'c-label-check',
  label: 'Label check',
  createdAt: 1,
  system: 'Check the claims in the listing against the label photo.',
  user: 'The listing:\n{{context}}',
  output: 'plain',
  pageContext: true,
  image: true,
  glossary: false,
};

const translateImage = vi.fn<NonNullable<TranslationBackend['translateImage']>>(async (a) => {
  a.onChunk({ type: 'delta', requestId: a.requestId, text: 'The label says 4 g of sugar.' });
  a.onChunk({ type: 'done', requestId: a.requestId });
});

async function seedSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = mkSettings({ contextEnabled: true, pageContextLevel: 'rich', ...patch });
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: s });
  resetSettingsCacheForTest();
  await ensureSettings();
  return s;
}

/** Right-click → Label check, as the context-menu handler runs it, with the tab's content script on this page. */
async function rightClickLabelCheck(s: Settings): Promise<{ system: string; user: string }> {
  const router = createRouter(
    baseDeps({
      getSettings: async () => s,
      getCustomTasks: async () => [labelCheck],
      backends: [
        {
          id: asBackendIdUnsafe('anthropic'),
          manifest: testManifest('anthropic', true),
          isAvailable: async () => true,
          translate: vi.fn(),
          translateImage,
        },
      ],
    }),
  );
  const results: unknown[] = [];
  await dispatchImageTranslate({
    tabId: 3,
    imageUrl: IMG,
    task: labelCheck.id,
    surface: 'tooltip',
    pageHost: 'shop.example.com',
    getSettings: async () => s,
    getCustomTasks: async () => [labelCheck],
    router,
    broadcast: () => {},
    sendToTab: (_tab, m) => results.push(m),
    logger: { error: () => {} },
  });
  expect(results.at(-1)).toMatchObject({
    kind: 'content:image-translate-result',
    translation: 'The label says 4 g of sugar.',
  });
  const args = translateImage.mock.calls.at(-1)?.[0];
  return { system: args?.system ?? '', user: args?.user ?? '' };
}

beforeEach(() => {
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  // The worker's tab message lands in this page's content script, as chrome.tabs.sendMessage does.
  (chromeMock.tabs.sendMessage as Mock).mockImplementation(
    (_tabId: number, msg: unknown) =>
      new Promise((resolve) => {
        chromeMock.runtime.onMessage.emit(msg, { id: chromeMock.runtime.id }, resolve);
      }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { 'content-type': 'image/png' },
        }),
    ),
  );
  translateImage.mockClear();
  document.title = TITLE;
  document.body.innerHTML = `<main><h1>Oat drink</h1>
    <p>No added sugar. Only 1 g of sugar per glass.</p>
    <figure><img src="${IMG}" alt="Back label with nutrition facts"><figcaption>Back of the carton</figcaption></figure>
    <p>Ships in 2 days.</p></main>`;
});

afterEach(() => {
  (chromeMock.tabs.sendMessage as Mock).mockResolvedValue({ ok: true });
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.title = '';
});

describe("a custom image task's {{context}} carries the page it was clicked on", () => {
  it('the backend prompt holds the listing title, the text around the image and its alt text', async () => {
    const { user } = await rightClickLabelCheck(await seedSettings({}));
    expect(user).toContain(`Title: ${TITLE}`);
    expect(user).toContain('URL: http://localhost:3000/');
    expect(user).toContain('Only 1 g of sugar per glass.');
    expect(user).toContain('Image alt text: "Back label with nutrition facts"');
    expect(user).toContain('Image caption: "Back of the carton"');
  });

  it('with "Send page context" off, the prompt holds nothing from the page', async () => {
    const { system, user } = await rightClickLabelCheck(
      await seedSettings({ contextEnabled: false }),
    );
    expect(`${system}\n${user}`).not.toContain(TITLE);
    expect(`${system}\n${user}`).not.toContain('PAGE CONTEXT:');
  });

  it('on a site turned off, the prompt holds nothing from the page', async () => {
    const { system, user } = await rightClickLabelCheck(
      await seedSettings({ sitePrefs: { 'http://localhost:3000': { disabled: true } } }),
    );
    expect(`${system}\n${user}`).not.toContain(TITLE);
    expect(`${system}\n${user}`).not.toContain('PAGE CONTEXT:');
  });
});
