// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cancelPageTranslateV2,
  routePageV2Chunk,
  runPageTranslateV2,
} from '@/content/page-translate-v2';
import { deps, enterAndFire, flush } from '@tests/_helpers/page-translate';
import { FakeObserver, finishAll, rig } from '@tests/_helpers/page-translate';
import { runWholePageTranslate } from '@/content/page-translate-v2';

beforeEach(async () => {
  document.body.innerHTML = '';
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.unstubAllGlobals();
});

describe('Choose areas over a failed area', () => {
  it.each([
    '<div style="display:grid"><div id="a">これは元の段落です。</div></div>',
    '<details open><summary id="a">これは元の段落です。</summary></details>',
  ])('a failed Show-both box inside its source chooses that source: %s', async (html) => {
    document.body.innerHTML = html;
    const r = rig();
    r.d.getSettings = () =>
      Promise.resolve({ pageTranslateMode: 'bilingual', batchConcurrency: 3 } as never);
    await enterAndFire(r.d, ['a']);
    routePageV2Chunk({
      type: 'error',
      requestId: r.sent[0]?.id ?? '',
      code: 'UNKNOWN',
      message: 'no',
    });
    await flush();
    const mark = document.querySelector('[data-ega-inside][data-ega-tx-state="error"]');
    expect(mark).not.toBeNull();
    await runPageTranslateV2(r.d);
    mark?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(r.sent).toHaveLength(2);
    expect(r.sent[1]?.text).toBe('これは元の段落です。');
  });

  it.each(['inplace', 'bilingual'])(
    'retries only the failed leading run in %s, without sending its translated child again',
    async (mode) => {
      vi.stubGlobal('IntersectionObserver', FakeObserver);
      document.body.innerHTML =
        '<div id="parent">これは最初の段落です。<p id="child">これは子の段落です。</p></div>';
      const r = rig();
      r.d.getSettings = () =>
        Promise.resolve({ pageTranslateMode: mode, batchConcurrency: 3 } as never);
      await runWholePageTranslate(r.d);
      FakeObserver.last?.band(new Set([...document.querySelectorAll('#parent, #child')]));
      await flush();
      routePageV2Chunk({
        type: 'error',
        requestId: r.sent[0]?.id ?? '',
        code: 'UNKNOWN',
        message: 'no',
      });
      finishAll(r, 1);
      await flush();
      const mark = document.querySelector('[data-ega-run][data-ega-tx-state="error"]');
      expect(mark).not.toBeNull();
      await runPageTranslateV2(r.d);
      mark?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await flush();
      expect(r.sent.map((s) => s.text)).toEqual([
        'これは最初の段落です。',
        'これは子の段落です。',
        'これは最初の段落です。',
      ]);
      expect(
        document.querySelector('#child [data-ega-replaced]')?.textContent ??
          document.querySelector('#child + [data-ega-tx]')?.textContent,
      ).toBe('T');
    },
  );

  it('a leading run left after Close bar gives an honest refusal', async () => {
    document.body.innerHTML =
      '<div id="parent"><span data-ega-run data-ega-replaced="old" data-ega-id="old" data-ega-tx-state="error">Texto original</span><p>Otro párrafo</p></div>';
    await runPageTranslateV2(deps());
    document
      .querySelector('[data-ega-run]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const status = document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector('[data-ega-ms-count]')?.textContent;
    expect(status).toBe(
      'This area can no longer be retried. Remove its translation and choose it again.',
    );
  });

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
