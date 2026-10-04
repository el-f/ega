// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  cancel,
  dropVariant,
  errorTurnParts,
  searchTurns,
  selectVariant,
} from '@/sidepanel/state/conversation';
import type { Turn, Variant, AssistantTurnData } from '@/sidepanel/state/conversation';

function variant(id: string, over: Partial<Variant> = {}): Variant {
  return { id, status: 'done', content: id, ...over };
}

function assistant(
  variants: Variant[],
  activeVariantIdx: number,
  over: Partial<AssistantTurnData> = {},
): AssistantTurnData {
  return {
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content: variants[activeVariantIdx]?.content ?? '',
    attachedToTurnId: 'u1',
    variants,
    activeVariantIdx,
    ...over,
  };
}

function user(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

describe('dropping a variant moves the active index with it', () => {
  const three = (): Variant[] => [variant('v1'), variant('v2'), variant('v3')];

  it('steps back one when the active variant is the one dropped', () => {
    const out = dropVariant([assistant(three(), 2)], 'a1', 'v3');

    expect(out[0]?.variants?.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(out[0]?.activeVariantIdx).toBe(1);
  });

  it('stays at zero when the first variant is both active and dropped', () => {
    const out = dropVariant([assistant(three(), 0)], 'a1', 'v1');

    expect(out[0]?.variants?.map((v) => v.id)).toEqual(['v2', 'v3']);
    expect(out[0]?.activeVariantIdx).toBe(0);
  });

  it('shifts down when the dropped variant sat before the active one', () => {
    const out = dropVariant([assistant(three(), 2)], 'a1', 'v1');

    expect(out[0]?.variants?.map((v) => v.id)).toEqual(['v2', 'v3']);
    expect(out[0]?.activeVariantIdx).toBe(1);
    expect(out[0]?.content).toBe('v3');
  });

  it('leaves the index alone when the dropped variant sat after the active one', () => {
    const out = dropVariant([assistant(three(), 0)], 'a1', 'v3');

    expect(out[0]?.activeVariantIdx).toBe(0);
    expect(out[0]?.content).toBe('v1');
  });

  it('refuses to drop the last variant', () => {
    const turn = assistant([variant('v1')], 0);

    expect(dropVariant([turn], 'a1', 'v1')[0]?.variants).toHaveLength(1);
  });

  it('is a no-op copy when the variant id is not on the turn', () => {
    const turns = [assistant(three(), 1)];

    const out = dropVariant(turns, 'a1', 'gone');

    expect(out[0]?.variants).toHaveLength(3);
    expect(out).not.toBe(turns);
  });
});

describe('selectVariant range', () => {
  it('takes the first and last index and refuses anything outside', () => {
    const turns = [assistant([variant('v1'), variant('v2')], 0)];

    expect(selectVariant(turns, 'a1', 1)[0]?.activeVariantIdx).toBe(1);
    expect(selectVariant(turns, 'a1', 0)[0]?.activeVariantIdx).toBe(0);
    expect(selectVariant(turns, 'a1', 2)[0]?.activeVariantIdx).toBe(0);
    expect(selectVariant(turns, 'a1', -1)[0]?.activeVariantIdx).toBe(0);
  });
});

describe('the three parts of a failed turn', () => {
  it('splits the heading, the body and the hidden detail at the first newline', () => {
    const parts = errorTurnParts({ code: 'RATE_LIMIT', message: 'Slow down\nretry after 30s' });

    expect(parts.title).not.toBe('Error');
    expect(parts.body).toBe('Slow down');
    expect(parts.detail).toBe('retry after 30s');
  });

  it('has no detail when the message is a single line', () => {
    const parts = errorTurnParts({ code: 'RATE_LIMIT', message: 'Slow down' });

    expect(parts.body).toBe('Slow down');
    expect(parts.detail).toBeUndefined();
  });

  it('has no detail when everything after the newline is blank', () => {
    const parts = errorTurnParts({ code: 'RATE_LIMIT', message: 'Slow down\n   ' });

    expect(parts.detail).toBeUndefined();
  });

  it('calls an unknown code Error', () => {
    expect(errorTurnParts({ code: 'not-a-code', message: 'x' }).title).toBe('Error');
    expect(errorTurnParts({ code: 'UNKNOWN', message: 'x' }).title).toBe('Error');
  });

  it('strips a heading an older build had written into the message', () => {
    const withTitle = errorTurnParts({ code: 'RATE_LIMIT', message: 'x' }).title;

    const parts = errorTurnParts({ code: 'RATE_LIMIT', message: `${withTitle}: Slow down` });

    expect(parts.body).toBe('Slow down');
  });

  it('trims the body', () => {
    expect(errorTurnParts({ code: 'UNKNOWN', message: '  padded  ' }).body).toBe('padded');
  });
});

describe('search folding', () => {
  it('matches regardless of case in plain ASCII', () => {
    const turns = [user('u1', 'Hello World')];

    expect(searchTurns(turns, 'hello world')).toHaveLength(1);
  });

  it('matches Hebrew text typed without its points', () => {
    const turns = [user('u1', 'שָׁלוֹם')];

    expect(searchTurns(turns, 'שלום')).toHaveLength(1);
  });

  it('matches Arabic text typed without its harakat', () => {
    const turns = [user('u1', 'مَرْحَبًا')];

    expect(searchTurns(turns, 'مرحبا')).toHaveLength(1);
  });

  it('still tells two different non-ASCII words apart', () => {
    const turns = [user('u1', 'שלום')];

    expect(searchTurns(turns, 'להתראות')).toHaveLength(0);
  });

  it('returns the same array for an empty query', () => {
    const turns = [user('u1', 'anything')];

    expect(searchTurns(turns, '   ')).toBe(turns);
  });
});

describe('canceling a turn', () => {
  it('marks every unsettled variant canceled and leaves the settled ones', () => {
    const turns = [
      assistant([variant('v1', { status: 'done' }), variant('v2', { status: 'streaming' })], 1, {
        status: 'streaming',
      }),
    ];

    const out = cancel(turns, 'a1');

    expect(out[0]?.variants?.[0]?.status).toBe('done');
    expect(out[0]?.variants?.[1]?.status).toBe('error');
    expect(out[0]?.variants?.[1]?.error?.code).toBe('cancelled');
  });

  it('does nothing to a turn that has already settled with nothing in flight', () => {
    const turns = [assistant([variant('v1', { status: 'done' })], 0, { status: 'done' })];

    expect(cancel(turns, 'a1')).toBe(turns);
  });

  it('still cancels a settled turn that has a pending variant named as in flight', () => {
    const turns = [
      assistant([variant('v1', { status: 'done' }), variant('v2', { status: 'pending' })], 0, {
        status: 'done',
      }),
    ];

    const out = cancel(turns, 'a1', 'v2');

    expect(out[0]?.variants?.[1]?.status).toBe('error');
  });
});
