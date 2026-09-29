// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runPageTranslateV2, cancelPageTranslateV2 } from '@/content/page-translate-v2';
import { patchSettings } from '@/shared/settings-bus';
import { debugCatch } from '@/shared/logger';
import type * as LoggerModule from '@/shared/logger';
import { deps, flush } from '@tests/_helpers/page-translate';

vi.mock('@/shared/settings-bus', () => ({ patchSettings: vi.fn() }));
vi.mock('@/shared/logger', async (orig) => ({
  ...(await orig<typeof LoggerModule>()),
  debugCatch: vi.fn(),
}));

const patch = vi.mocked(patchSettings);
const caught = vi.mocked(debugCatch);

/** `M` toggles the render mode, which is the only caller of persistMode. */
function pressM(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '<p id="p1">some text worth translating on this page</p>';
  patch.mockReset();
  caught.mockReset();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('persisting the render mode', () => {
  it('reports the reason when the settings write is refused', async () => {
    patch.mockResolvedValue({ ok: false, reason: 'quota' });

    await runPageTranslateV2(deps());
    pressM();
    await flush();

    expect(patch).toHaveBeenCalledWith({ pageTranslateMode: 'bilingual' });
    expect(caught).toHaveBeenCalledWith(expect.any(Error), 'content.pageV2.persistMode');
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ message: 'quota' });
  });

  it('says nothing when the write is accepted', async () => {
    patch.mockResolvedValue({ ok: true });

    await runPageTranslateV2(deps());
    pressM();
    await flush();

    expect(patch).toHaveBeenCalledTimes(1);
    expect(caught).not.toHaveBeenCalled();
  });

  it('swallows a settings bus that throws instead of rejecting, and reports it', async () => {
    patch.mockImplementation(() => {
      throw new Error('bus is gone');
    });

    await runPageTranslateV2(deps());
    pressM();
    await flush();

    expect(caught).toHaveBeenCalledWith(expect.any(Error), 'content.pageV2.persistMode');
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ message: 'bus is gone' });
  });
});
