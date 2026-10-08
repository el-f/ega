// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cancelPageTranslateV2,
  routePageV2Chunk,
  runPageTranslateV2,
} from '@/content/page-translate-v2';
import { deps, enterAndFire, flush } from '@tests/_helpers/page-translate';

beforeEach(async () => {
  document.body.innerHTML = '';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
});

describe('Choose areas over a failed area', () => {
  it('a click on the failed area chooses it and sends it again, never "already translated"', async () => {
    document.body.innerHTML = '<p id="a">これは元の段落です。</p>';
    const ids: string[] = [];
    const d = deps({
      dispatch: vi.fn((requestId: string) => {
        ids.push(requestId);
        return Promise.resolve();
      }),
    });
    await enterAndFire(d, ['a']);
    routePageV2Chunk({ type: 'error', requestId: ids[0] ?? '', code: 'UNKNOWN', message: 'no' });
    await flush();
    const failed = document.querySelector('[data-ega-tx-state="error"]');
    expect(failed).not.toBeNull();

    await runPageTranslateV2(d);
    failed?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const status = document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector('[data-ega-ms-count]')?.textContent;
    expect(status).toBe('1 area chosen');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(ids).toHaveLength(2);
  });
});
