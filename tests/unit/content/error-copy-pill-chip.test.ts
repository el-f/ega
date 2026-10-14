// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { ALL_ERR_CODES } from '@/shared/types';
import { errorCopy } from '@/shared/error-copy';
import { mountErrorChip } from '@/content/page-chip';
import type * as BatchMod from '@/content/batch-progress';

// Spec 13.2 check 9 for the page surfaces: whatever the provider says, the chip and the pill show the catalog's words.

const PROVIDER_TEXT = 'Anthropic HTTP 500: upstream exploded';
const RAW = /\b[1-5]\d\d\b|HTTP|upstream|[A-Z]{2,}_[A-Z]+|image-translate/;
const CODES = [...ALL_ERR_CODES.filter((c) => c !== 'ABORTED'), 'EMPTY' as const];

let batch: typeof BatchMod;

beforeAll(async () => {
  batch = await import('@/content/batch-progress');
}, 60_000);

afterEach(() => {
  if (batch.isBatchProgressActive()) batch.showBatchProgress(1, () => {}).dismiss();
  document.body.innerHTML = '';
});

function sentences(text: string): number {
  return text.split(/[.!?](?:\s|$)/).filter((s) => s.trim() !== '').length;
}

describe.each(CODES)('%s', (code) => {
  it('the chip shows a short catalog title and never the provider text', () => {
    const host = mountErrorChip(
      { code, message: PROVIDER_TEXT },
      { backend: 'Anthropic', onRetry: () => {} },
    );
    document.body.append(host);
    const chip = host.shadowRoot?.querySelector('.chip');
    const title = chip?.querySelector('span')?.textContent ?? '';
    expect(title.split(/\s+/).length).toBeLessThanOrEqual(4);
    expect(chip?.textContent).not.toMatch(RAW);
  });

  it('the settled pill shows the catalog sentence and never the provider text', () => {
    const copy = errorCopy(code, PROVIDER_TEXT, { backend: 'Anthropic' });
    if (!copy) throw new Error(`no catalog row for ${code}`);
    expect(sentences(copy.body)).toBeLessThanOrEqual(2);
    const h = batch.showBatchProgress(5, () => {});
    h.update({
      done: 5,
      failed: 2,
      total: 5,
      waiting: 0,
      inFlight: 0,
      queued: 0,
      skipped: 0,
      settled: true,
      failure: { body: copy.body, actions: copy.actions, tab: copy.tab, details: [PROVIDER_TEXT] },
    });
    flushSync();
    const pill = document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector('[data-ega-batch-progress]');
    const label = pill?.querySelector('[data-ega-batch-label]')?.textContent ?? '';
    expect(label).toContain(copy.body);
    // Everything visible on the row, buttons included; Error details holds the provider text.
    expect(pill?.querySelector('.row')?.textContent).not.toMatch(RAW);
  });
});
