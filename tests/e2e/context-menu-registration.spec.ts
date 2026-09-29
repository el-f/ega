import { test, expect } from '@playwright/test';
import { launchExtension, type ExtensionHandle } from './helpers';

let ext: ExtensionHandle;

test.beforeEach(async () => {
  ext = await launchExtension();
});

test.afterEach(async () => {
  await ext.close();
});

interface UpdateProbe {
  ok: boolean;
  error?: string;
}

async function probeMenuId(id: string): Promise<UpdateProbe> {
  const prefix = `chrome-extension://${ext.extensionId}/`;
  const sw = ext.context.serviceWorkers().find((w) => w.url().startsWith(prefix));
  if (!sw) throw new Error('service worker not found');
  return (await sw.evaluate(async (menuId) => {
    const g = self as unknown as {
      chrome?: {
        contextMenus?: {
          update: (id: string, props: Record<string, unknown>, cb?: () => void) => unknown;
        };
        runtime?: { lastError?: { message: string } };
      };
    };
    const cm = g.chrome?.contextMenus;
    if (!cm || typeof cm.update !== 'function') {
      return { ok: false, error: 'contextMenus.update missing' };
    }
    return await new Promise<UpdateProbe>((resolve) => {
      let settled = false;
      const finish = (r: UpdateProbe): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      try {
        const ret = cm.update(menuId, {}, () => {
          const err = g.chrome?.runtime?.lastError;
          finish(err ? { ok: false, error: err.message } : { ok: true });
        });
        if (ret && typeof (ret as { then?: unknown }).then === 'function') {
          (ret as Promise<unknown>)
            .then(() => finish({ ok: true }))
            .catch((e: unknown) => finish({ ok: false, error: String(e) }));
        }
      } catch (e) {
        finish({ ok: false, error: String(e) });
      }
      setTimeout(() => finish({ ok: false, error: 'probe timed out' }), 3_000);
    });
  }, id)) as UpdateProbe;
}

// The update() probe reaches children too — Chrome's menu-id namespace is flat across the tree.
const DEFAULT_REGISTERED_IDS = [
  'ega-root',
  'ega-translate-selection',
  'ega-sidepanel-selection',
  'ega-translate-page',
  'ega-pick-element',
  'ega-translate-image',
  'ega-explain-image',
  'ega-toggle-site',
];

test('nested default menu: ega-root and all 7 items are registered', async () => {
  await new Promise((r) => setTimeout(r, 200));

  const deadline = Date.now() + 5_000;
  let lastResults: Array<{ id: string; probe: UpdateProbe }> = [];
  while (Date.now() < deadline) {
    lastResults = await Promise.all(
      DEFAULT_REGISTERED_IDS.map(async (id) => ({ id, probe: await probeMenuId(id) })),
    );
    if (lastResults.every((r) => r.probe.ok)) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  for (const { id, probe } of lastResults) {
    expect(probe.ok, `menu id "${id}" missing: ${probe.error ?? 'ok'}`).toBe(true);
  }
});

test('ega-sidepanel-selection (send to side panel) is registered', async () => {
  await new Promise((r) => setTimeout(r, 200));

  const deadline = Date.now() + 5_000;
  let probe: UpdateProbe = { ok: false, error: 'not yet probed' };
  while (Date.now() < deadline) {
    probe = await probeMenuId('ega-sidepanel-selection');
    if (probe.ok) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  expect(probe.ok, `ega-sidepanel-selection not registered: ${probe.error ?? 'ok'}`).toBe(true);
});

test('the ega-root parent node is registered', async () => {
  await new Promise((r) => setTimeout(r, 200));

  const deadline = Date.now() + 5_000;
  let probe: UpdateProbe = { ok: false, error: 'not yet probed' };
  while (Date.now() < deadline) {
    probe = await probeMenuId('ega-root');
    if (probe.ok) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  expect(probe.ok, `ega-root not registered (expected nested layout): ${probe.error ?? 'ok'}`).toBe(
    true,
  );
});

test('the removed ega-translate-comments id is absent', async () => {
  await new Promise((r) => setTimeout(r, 200));
  const probe = await probeMenuId('ega-translate-comments');
  expect(probe.ok, 'ega-translate-comments should be absent (retired)').toBe(false);
  expect(probe.error ?? '').toMatch(/cannot find|unknown|invalid/i);
});
