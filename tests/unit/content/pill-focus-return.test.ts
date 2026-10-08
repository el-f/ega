// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import {
  runWholePageTranslate,
  cancelPageTranslateV2,
  routePageV2Chunk,
} from '@/content/page-translate-v2';
import { showBatchProgress } from '@/content/batch-progress';
import { FakeObserver, deps, flush } from '@tests/_helpers/page-translate';

// The real session and the real pill: a keyboard user who came from a Try-again chip keeps a place to land.

function pill(selector: string): HTMLElement {
  const el = document
    .getElementById('ega-shadow-host')
    ?.shadowRoot?.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

async function failedBlock(mode: 'inplace' | 'bilingual' = 'inplace'): Promise<HTMLElement> {
  document.body.innerHTML = '<p id="p">これは一つだけの段落です。</p>';
  const sent: string[] = [];
  const d = deps(
    {
      dispatch: vi.fn((id: string) => {
        sent.push(id);
        return Promise.resolve();
      }),
      mountProgress: (total, stop) => showBatchProgress(total, stop),
      isTargetLanguage: () => false,
    },
    { pageTranslateMode: mode },
  );
  await runWholePageTranslate(d);
  FakeObserver.last?.band(new Set([document.getElementById('p') as HTMLElement]));
  await flush();
  routePageV2Chunk({ type: 'error', requestId: sent[0] ?? '', code: 'UNKNOWN', message: 'x' });
  await flush();
  flushSync();
  return document.querySelector('[data-ega-tx-error]') as HTMLElement;
}

/** Tab from the chip's button into the pill: focus from another shadow tree arrives retargeted to its host. */
function tabIntoPill(chip: HTMLElement, to: HTMLElement): void {
  chip.shadowRoot?.querySelector<HTMLElement>('button')?.focus();
  to.focus();
  to.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, composed: true, relatedTarget: chip }),
  );
}

beforeEach(async () => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  await cancelPageTranslateV2();
});

afterEach(async () => {
  vi.useRealTimers();
  await cancelPageTranslateV2();
  vi.unstubAllGlobals();
});

describe('the pill gives focus back when its button takes the chip button away', () => {
  it('Close bar drops the chip Try again; focus stays on the chip', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const chip = await failedBlock();
    vi.setSystemTime(Date.now() + 1000);
    const close = pill('[data-ega-batch-close]');
    tabIntoPill(chip, close);
    close.click();
    expect(chip.shadowRoot?.querySelector('[data-ega-retry-block]')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it('Remove translation takes the chip away; focus goes to its block', async () => {
    const chip = await failedBlock();
    const more = pill('[data-ega-batch-more]');
    tabIntoPill(chip, more);
    more.click();
    flushSync();
    pill('[data-ega-batch-remove]').click();
    await flush();
    expect(document.querySelector('[data-ega-tx-error]')).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('p'));
  });

  it('in Show both, Remove translation takes the box beside the block; focus goes to the block', async () => {
    const chip = await failedBlock('bilingual');
    const more = pill('[data-ega-batch-more]');
    tabIntoPill(chip, more);
    more.click();
    flushSync();
    pill('[data-ega-batch-remove]').click();
    await flush();
    expect(document.querySelector('[data-ega-tx]')).toBeNull();
    expect(document.getElementById('p')?.textContent).toBe('これは一つだけの段落です。');
    expect(document.activeElement).toBe(document.getElementById('p'));
  });
});
