import { describe, it, expect } from 'vitest';
import {
  addAssistantTurn,
  addUserTurn,
  addVariant,
  dropVariant,
  variantIdxForTarget,
  type Turn,
  type Variant,
} from '@/sidepanel/state/conversation';
import { asLangIdUnsafe } from '@/shared/brands';

const EN = asLangIdUnsafe('en');
const FR = asLangIdUnsafe('fr');
const DE = asLangIdUnsafe('de');

function v(id: string, status: Variant['status'], extra: Partial<Variant> = {}): Variant {
  return { id, status, content: status === 'done' ? `body-${id}` : '', ...extra };
}

function assistant(variants: Variant[], activeVariantIdx: number): Turn {
  const active = variants[activeVariantIdx];
  if (!active) throw new Error('bad fixture');
  return {
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: active.status,
    content: active.content,
    attachedToTurnId: 'u1',
    variants,
    activeVariantIdx,
    createdAt: 1,
  };
}

describe('addVariant — targetLang seed', () => {
  it('records targetLang on the new variant and leaves it absent otherwise', () => {
    const base = addAssistantTurn(addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' }), {
      id: 'a1',
      kind: 'translate',
      attachedToTurnId: 'u1',
    });
    const withLang = addVariant(base, 'a1', { id: 'v2', targetLang: FR });
    expect(withLang[1]?.variants?.[1]?.targetLang).toBe(FR);
    const without = addVariant(base, 'a1', { id: 'v2' });
    expect(without[1]?.variants?.[1]).not.toHaveProperty('targetLang');
  });
});

describe('dropVariant', () => {
  it('removes the active variant and projects the previous one back onto the turn', () => {
    const turns = [assistant([v('v1', 'done'), v('v2', 'pending')], 1)];
    const out = dropVariant(turns, 'a1', 'v2');
    const a = out[0];
    expect(a?.variants?.map((x) => x.id)).toEqual(['v1']);
    expect(a?.activeVariantIdx).toBe(0);
    expect(a?.status).toBe('done');
    expect(a?.content).toBe('body-v1');
  });

  it('keeps the active index on the same variant when an earlier one is removed', () => {
    const turns = [assistant([v('v1', 'done'), v('v2', 'done'), v('v3', 'done')], 2)];
    const out = dropVariant(turns, 'a1', 'v2');
    expect(out[0]?.variants?.map((x) => x.id)).toEqual(['v1', 'v3']);
    expect(out[0]?.activeVariantIdx).toBe(1);
    expect(out[0]?.content).toBe('body-v3');
  });

  it('is a no-op on the only variant, an unknown variant, or an unknown turn', () => {
    const single = [assistant([v('v1', 'done')], 0)];
    expect(dropVariant(single, 'a1', 'v1')[0]?.variants?.length).toBe(1);
    const pair = [assistant([v('v1', 'done'), v('v2', 'done')], 1)];
    expect(dropVariant(pair, 'a1', 'nope')[0]?.variants?.length).toBe(2);
    expect(dropVariant(pair, 'zzz', 'v2')[0]?.variants?.length).toBe(2);
  });

  it('does not mutate the input', () => {
    const turns = [assistant([v('v1', 'done'), v('v2', 'done')], 1)];
    dropVariant(turns, 'a1', 'v2');
    expect(turns[0]?.variants?.length).toBe(2);
    expect(turns[0]?.activeVariantIdx).toBe(1);
  });
});

describe('variantIdxForTarget', () => {
  it('reads v1 as the original dispatch target', () => {
    const t = assistant([v('v1', 'done')], 0);
    expect(variantIdxForTarget(t, EN, EN)).toBe(0);
    expect(variantIdxForTarget(t, EN, FR)).toBe(-1);
  });

  it('finds a done variant by its recorded targetLang', () => {
    const t = assistant([v('v1', 'done'), v('v2', 'done', { targetLang: FR })], 1);
    expect(variantIdxForTarget(t, EN, FR)).toBe(1);
    expect(variantIdxForTarget(t, EN, DE)).toBe(-1);
  });

  it('matches on the modifiers too, so a language pick cannot land on a refined sibling', () => {
    const t = assistant(
      [
        v('v1', 'done'),
        v('v2', 'done', { targetLang: FR }),
        v('v3', 'done', { refinementBody: 'x' }),
      ],
      2,
    );
    // A plain pick wants the plain answer, not the refined one that also answers in EN.
    expect(variantIdxForTarget(t, EN, EN)).toBe(0);
    expect(variantIdxForTarget(t, EN, EN, { refinementBody: 'x' })).toBe(2);
    expect(variantIdxForTarget(t, EN, EN, { refinementBody: 'other' })).toBe(-1);
  });

  it('ignores variants that are not done', () => {
    const t = assistant([v('v1', 'done'), v('v2', 'error', { targetLang: FR })], 1);
    expect(variantIdxForTarget(t, EN, FR)).toBe(-1);
  });

  it('returns -1 when the turn has no variants', () => {
    const t: Turn = { ...assistant([v('v1', 'done')], 0) };
    delete t.variants;
    delete t.activeVariantIdx;
    expect(variantIdxForTarget(t, EN, EN)).toBe(-1);
  });
});
