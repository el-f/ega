import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  confidenceItem,
  detectedVarieties,
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

  // A reply stored before the short-tag rule can carry the cue words as its detail.
  it('cuts a long name for the meta line, never the target, and keeps the full one', () => {
    const input = {
      detected: [{ id: 'arabizi', detail: 'Levantine (kifak, shu, 3am, ktir, 3njad)' }],
      targetLang: 'en',
    };
    expect(directionLabel(input)).toBe(
      'Arabizi — Levantine (kifak, shu, 3am, ktir, 3njad) → English',
    );
    const short = directionLabel({ ...input, short: true });
    expect(short).toBe('Arabizi — Levantine (kifak, shu, 3am… → English');
    expect(short.length).toBeLessThanOrEqual(48);
  });

  // A flag, a skin tone and a family are each one emoji made of several code points.
  it.each(['😀', '🇮🇱', '👍🏽', '👨‍👩‍👧'])('never cuts a name inside the emoji %s', (emoji) => {
    const detail = 'a'.repeat(46) + emoji.repeat(3);
    expect(directionLabel({ detected: [{ id: 'other', detail }], short: true })).toBe(
      'a'.repeat(46) + emoji + '…',
    );
  });

  it('cuts mixed text as one part at a word, so the target stays on the line', () => {
    const input = {
      detected: [
        { id: 'other', detail: 'Romanized Hindi with Bhojpuri words' },
        { id: 'other', detail: 'Nigerian Pidgin English dialect text' },
      ],
      targetLang: 'en',
    };
    const short = directionLabel({ ...input, short: true });
    expect(short).toBe('Romanized Hindi with Bhojpuri words… → English');
    expect(short.length).toBeLessThanOrEqual(48);
    expect(directionLabel(input)).toBe(
      'Romanized Hindi with Bhojpuri words + Nigerian Pidgin English dialect text → English',
    );
  });

  it('cuts a long custom target too, and the source gets what is left', () => {
    const short = directionLabel({
      detected: [{ id: 'arabizi', detail: 'Levantine' }],
      targetLang: 'custom-long',
      varieties: [{ id: 'custom-long', label: 'Very Long Custom Language Name For Testing Here' }],
      short: true,
    });
    expect(short).toBe('Arabizi… → Very Long Custom Language Name…');
  });

  it('keeps a hard cut when the long name is one word', () => {
    const detail = 'x'.repeat(60);
    expect(directionLabel({ detected: [{ id: 'other', detail }], short: true })).toBe(
      'x'.repeat(47) + '…',
    );
  });

  it('names both languages of mixed text, short or full, when they fit', () => {
    const input = {
      detected: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
      targetLang: 'en',
    };
    expect(directionLabel(input)).toBe('Arabizi (Levantine) + English → English');
    expect(directionLabel({ ...input, short: true })).toBe(
      'Arabizi (Levantine) + English → English',
    );
  });

  it('reads the detected list from a reply, a detail alone as its own name', () => {
    expect(detectedVarieties({ detectedLang: 'arabizi', detectedDetail: 'Levantine' })).toEqual([
      { id: 'arabizi', detail: 'Levantine' },
    ]);
    expect(detectedVarieties({ detectedDetail: 'Venetian Italian' })).toEqual([
      { id: 'other', detail: 'Venetian Italian' },
    ]);
    expect(
      detectedVarieties({
        detectedLang: 'arabizi',
        detectedLangs: [{ id: 'arabizi' }, { id: 'en' }],
      }),
    ).toEqual([{ id: 'arabizi' }, { id: 'en' }]);
    expect(detectedVarieties({})).toEqual([]);
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
