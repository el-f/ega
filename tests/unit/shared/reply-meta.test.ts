import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  confidenceItem,
  directionLabel,
  replyMetaItems,
  type ReplyMetaInput,
} from '@/shared/reply-meta';
import { asBackendIdUnsafe } from '@/shared/brands';
import type { ResultMeta } from '@/shared/types';

const meta = (over: Partial<ResultMeta> = {}): ResultMeta => ({
  backendId: asBackendIdUnsafe('anthropic'),
  cacheHit: false,
  latencyMs: 1200,
  modelId: 'claude-haiku-4-5-20251001',
  ...over,
});

const ON = { show: true, threshold: 0 };

describe('directionLabel', () => {
  it('names the detected language with its detail in parens', () => {
    expect(
      directionLabel({
        detected: [{ id: 'arabizi', detail: 'Levantine' }],
        sourceLang: 'auto',
        targetLang: 'en',
      }),
    ).toBe('Arabizi (Levantine) → English');
  });

  it('joins mixed text with "+" and counts past two', () => {
    expect(directionLabel({ detected: [{ id: 'arabizi' }, { id: 'en' }], targetLang: 'he' })).toBe(
      'Arabizi + English → Hebrew',
    );
    expect(
      directionLabel({
        detected: [{ id: 'arabizi' }, { id: 'en' }, { id: 'fr' }],
        targetLang: 'he',
      }),
    ).toBe('Arabizi + English +1 → Hebrew');
  });

  it('falls back to the source the request named, and to nothing for Auto-detect', () => {
    expect(directionLabel({ sourceLang: 'es', targetLang: 'en' })).toBe('Spanish → English');
    expect(directionLabel({ sourceLang: 'auto', targetLang: 'en' })).toBe('');
  });

  it('shows only the source for a task that answers in it', () => {
    expect(directionLabel({ detected: [{ id: 'es' }], targetLang: 'en', sourceOnly: true })).toBe(
      'Spanish',
    );
  });
});

describe('confidenceItem (X3, X8)', () => {
  it('reads as plain text, and warns below 0.6', () => {
    expect(confidenceItem(0.93, ON)).toEqual({ key: 'confidence', text: '93% confident' });
    expect(confidenceItem(0.42, ON)).toEqual({
      key: 'confidence',
      text: 'Low confidence (42%)',
      warn: true,
    });
  });

  it('obeys the switch and the threshold from Settings', () => {
    expect(confidenceItem(0.93, { show: false, threshold: 0 })).toBeNull();
    expect(confidenceItem(0.5, { show: true, threshold: 0.7 })).toBeNull();
    expect(confidenceItem(undefined, ON)).toBeNull();
    expect(confidenceItem(0, ON)).toBeNull();
  });
});

describe('replyMetaItems', () => {
  it('orders status, bookmark, fallback, direction, version, model, confidence', () => {
    const items = replyMetaItems({
      status: 'Partial answer',
      bookmarked: true,
      meta: meta({
        backendId: asBackendIdUnsafe('gemini'),
        attempts: [
          { backendId: asBackendIdUnsafe('anthropic'), status: 'error', latencyMs: 10 },
          { backendId: asBackendIdUnsafe('gemini'), status: 'ok', latencyMs: 900 },
        ],
        modelId: 'gemini-2.5-flash',
      }),
      direction: 'Spanish → English',
      version: 'Shorter',
      confidence: 0.9,
      confidenceSetting: ON,
    });
    expect(items.map((i) => i.text)).toEqual([
      'Partial answer',
      'Bookmarked',
      'Answered by Gemini',
      'Anthropic failed',
      'Spanish → English',
      'Shorter',
      'Gemini 2.5 Flash',
      '90% confident',
    ]);
  });

  it('says "Saved answer" for a cache hit, and nothing about the model with no meta', () => {
    expect(replyMetaItems({ meta: meta({ cacheHit: true }) }).map((i) => i.text)).toEqual([
      'Saved answer',
    ]);
    expect(replyMetaItems({ direction: 'Spanish → English' }).map((i) => i.key)).toEqual([
      'direction',
    ]);
  });

  // The line clips from its end, so confidence must always be the last item when it shows.
  it('keeps confidence last and status first, whatever is present', () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.option(fc.constantFrom('Partial answer', 'Reading aloud'), { nil: undefined }),
          bookmarked: fc.boolean(),
          direction: fc.option(fc.constant('Spanish → English'), { nil: undefined }),
          version: fc.option(fc.constant('Shorter'), { nil: undefined }),
          confidence: fc.option(fc.double({ min: 0.01, max: 1, noNaN: true }), { nil: undefined }),
          cacheHit: fc.boolean(),
        }),
        (r) => {
          const input: ReplyMetaInput = {
            ...(r.status !== undefined ? { status: r.status } : {}),
            bookmarked: r.bookmarked,
            meta: meta({ cacheHit: r.cacheHit }),
            ...(r.direction !== undefined ? { direction: r.direction } : {}),
            ...(r.version !== undefined ? { version: r.version } : {}),
            confidence: r.confidence,
            confidenceSetting: ON,
          };
          const keys = replyMetaItems(input).map((i) => i.key);
          if (keys.includes('confidence')) expect(keys.at(-1)).toBe('confidence');
          if (keys.includes('status')) expect(keys[0]).toBe('status');
          expect(new Set(keys).size).toBe(keys.length);
        },
      ),
    );
  });
});
