// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  INDEX_KEY,
  loadThreadResult,
  parseThreadChange,
  saveThread,
  threadKey,
} from '@/sidepanel/state/conversation-store';

const CONV_STORE_VERSION = 1;
/** Mirrors the module-private MAX_DELETE_STAMPS; a change to one must break this. */
const MAX_DELETE_STAMPS = 8;

function goodTurn(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'u1',
    role: 'user',
    kind: 'translate',
    status: 'idle',
    createdAt: 1,
    content: 'hi',
    ...over,
  };
}

function blob(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: CONV_STORE_VERSION,
    origin: 'https://a.com',
    updatedAt: 5,
    turns: [goodTurn()],
    ...over,
  };
}

async function put(value: unknown): Promise<void> {
  await chrome.storage.local.set({ [threadKey('https://a.com')]: value });
}

describe('a turn row that is not the shape the parser demands', () => {
  it('keeps a well-formed row, so the guards are not simply dropping everything', async () => {
    await put(blob());
    expect((await loadThreadResult('https://a.com')).turns.map((t) => t.id)).toEqual(['u1']);
  });

  const dropped: Array<[string, unknown]> = [
    ['null instead of an object', null],
    ['a string instead of an object', 'u1'],
    ['a missing id', goodTurn({ id: undefined })],
    ['an id that is not a string', goodTurn({ id: 7 })],
    ['an empty id', goodTurn({ id: '' })],
    ['a role nothing renders', goodTurn({ role: 'system' })],
    ['a kind nothing renders', goodTurn({ kind: 'not-a-kind' })],
    ['content that is not a string', goodTurn({ content: 42 })],
    ['a createdAt that is not a number', goodTurn({ createdAt: '1' })],
  ];

  for (const [what, row] of dropped) {
    it(`drops a row with ${what}`, async () => {
      await put(blob({ turns: [row, goodTurn({ id: 'u2' })] }));

      expect((await loadThreadResult('https://a.com')).turns.map((t) => t.id)).toEqual(['u2']);
    });
  }

  it('keeps a trim mark that is a positive count and drops one that is not', async () => {
    await put(
      blob({
        turns: [
          goodTurn({ trimmedTo: 2000 }),
          goodTurn({ id: 'u2', trimmedTo: '<b>2000</b>' }),
          goodTurn({ id: 'u3', trimmedTo: -1 }),
        ],
      }),
    );

    const turns = (await loadThreadResult('https://a.com')).turns;
    expect(turns.map((t) => t.trimmedTo)).toEqual([2000, undefined, undefined]);
  });

  it('rewrites an unknown answer status as an interrupted error rather than dropping the turn', async () => {
    await put(blob({ turns: [goodTurn({ role: 'assistant', status: 'halfway' })] }));

    const [turn] = (await loadThreadResult('https://a.com')).turns;
    expect(turn?.status).toBe('error');
    expect(turn?.error?.code).toBe('interrupted');
    expect(turn?.error?.message).toContain('reloaded');
  });

  it('leaves a known answer status alone', async () => {
    await put(blob({ turns: [goodTurn({ role: 'assistant', status: 'done' })] }));

    const [turn] = (await loadThreadResult('https://a.com')).turns;
    expect(turn?.status).toBe('done');
    expect(turn?.error).toBeUndefined();
  });

  it('loads a user turn idle whatever status it was stored with, since a user turn never streams', async () => {
    await put(
      blob({ turns: [goodTurn({ status: 'halfway' }), goodTurn({ id: 'u2', status: 'done' })] }),
    );

    const turns = (await loadThreadResult('https://a.com')).turns;
    expect(turns.map((t) => [t.status, t.error])).toEqual([
      ['idle', undefined],
      ['idle', undefined],
    ]);
  });
});

describe('an assistant turn stored without variants', () => {
  it('gets one rebuilt from its own fields, with an empty rawAcc', async () => {
    await put(
      blob({
        turns: [goodTurn({ id: 'a1', role: 'assistant', status: 'done', content: 'bonjour' })],
      }),
    );

    const [turn] = (await loadThreadResult('https://a.com')).turns;
    expect(turn?.variants).toHaveLength(1);
    expect(turn?.variants?.[0]).toMatchObject({
      id: 'a1:v1',
      status: 'done',
      content: 'bonjour',
      rawAcc: '',
    });
    expect(turn?.activeVariantIdx).toBe(0);
  });

  it('leaves an assistant turn that already has variants untouched', async () => {
    const variants = [{ id: 'mine', status: 'done', content: 'kept' }];
    await put(
      blob({
        turns: [
          goodTurn({
            id: 'a1',
            role: 'assistant',
            status: 'done',
            content: 'x',
            variants,
            activeVariantIdx: 0,
          }),
        ],
      }),
    );

    const [turn] = (await loadThreadResult('https://a.com')).turns;
    expect(turn?.variants?.map((v) => v.id)).toEqual(['mine']);
  });

  it('rebuilds nothing for a user turn', async () => {
    await put(blob({ turns: [goodTurn()] }));

    expect((await loadThreadResult('https://a.com')).turns[0]?.variants).toBeUndefined();
  });
});

describe('a blob whose envelope is wrong', () => {
  const unreadable: Array<[string, unknown]> = [
    ['a version this build cannot read', blob({ version: 99 })],
    ['a version that is not a number', blob({ version: '1' })],
    ['an origin that is not a string', blob({ origin: 7 })],
    ['an updatedAt that is not a number', blob({ updatedAt: 'later' })],
    ['turns that are not an array', blob({ turns: { 0: goodTurn() } })],
    ['a string where the blob should be', 'nonsense'],
    ['null', null],
  ];

  for (const [what, value] of unreadable) {
    it(`reads ${what} as an empty, unreadable thread`, async () => {
      await put(value);

      const result = await loadThreadResult('https://a.com');
      expect(result.turns).toEqual([]);
      expect(result.unreadable).toBe(true);
    });
  }

  it('reads a missing key as empty but readable', async () => {
    await chrome.storage.local.remove(threadKey('https://a.com'));

    const result = await loadThreadResult('https://a.com');
    expect(result.turns).toEqual([]);
    expect(result.unreadable).toBe(false);
  });
});

describe('tombstones on a stored blob', () => {
  function tombstonesFor(
    raw: unknown,
  ): ReadonlyMap<string, { at: number; ats: readonly number[] }> {
    const view = parseThreadChange(blob({ tombstones: raw, turns: [] }), 'someone-else');
    if (view === null) throw new Error('a blob from another writer must parse');
    return view.tombstones;
  }

  it('keeps a stamp list that is well formed', () => {
    expect(tombstonesFor([{ id: 'x', at: 10, ats: [10, 11] }]).get('x')).toEqual({
      at: 10,
      ats: [10, 11],
    });
  });

  const fallsBack: Array<[string, unknown]> = [
    ['ats is missing', { id: 'x', at: 10 }],
    ['ats is not an array', { id: 'x', at: 10, ats: 10 }],
    ['ats is empty', { id: 'x', at: 10, ats: [] }],
    ['ats holds something that is not a number', { id: 'x', at: 10, ats: [10, 'now'] }],
  ];

  for (const [what, row] of fallsBack) {
    it(`falls back to the single at when ${what}, rather than unburying the turn`, () => {
      expect(tombstonesFor([row]).get('x')).toEqual({ at: 10, ats: [10] });
    });
  }

  const skipped: Array<[string, unknown]> = [
    ['the row is null', null],
    ['the row is a string', 'x'],
    ['the id is not a string', { id: 7, at: 10 }],
    ['at is not a number', { id: 'x', at: 'now' }],
  ];

  for (const [what, row] of skipped) {
    it(`drops the record when ${what}`, () => {
      const map = tombstonesFor([row, { id: 'keep', at: 1 }]);

      expect([...map.keys()]).toEqual(['keep']);
    });
  }

  it('reads a tombstones field that is not an array as none at all', () => {
    expect(tombstonesFor({ id: 'x', at: 1 }).size).toBe(0);
  });

  it('holds a stamp list at the cap but not one past it', () => {
    const atCap = Array.from({ length: MAX_DELETE_STAMPS }, (_, i) => i + 1);
    const pastCap = [...atCap, MAX_DELETE_STAMPS + 1];

    expect(tombstonesFor([{ id: 'x', at: 9, ats: atCap }]).get('x')?.ats).toEqual(atCap);
    expect(tombstonesFor([{ id: 'x', at: 9, ats: pastCap }]).get('x')?.ats).toEqual([9]);
  });
});

describe('the thread index', () => {
  it('keeps only the entries carrying both an origin and a bytes count', async () => {
    await chrome.storage.local.set({
      [INDEX_KEY]: {
        version: CONV_STORE_VERSION,
        threads: [
          { origin: 'https://kept.com', bytes: 10, updatedAt: 1 },
          { origin: 'https://nobytes.com', updatedAt: 1 },
          { bytes: 10, updatedAt: 1 },
          null,
          'nonsense',
        ],
      },
    });
    await put(blob());

    // saveThread rewrites the index from what parseIndex kept, plus the row it writes.
    await saveThread('https://a.com', []);

    const after = (await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] as {
      threads: Array<{ origin: string }>;
    };
    expect(after.threads.map((t) => t.origin).sort()).toEqual([
      'https://a.com',
      'https://kept.com',
    ]);
  });

  it('reads an index this build cannot version as no index at all', async () => {
    await chrome.storage.local.set({
      [INDEX_KEY]: { version: 99, threads: [{ origin: 'https://gone.com', bytes: 10 }] },
    });

    await saveThread('https://a.com', []);

    const after = (await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] as {
      threads: Array<{ origin: string }>;
    };
    expect(after.threads.map((t) => t.origin)).toEqual(['https://a.com']);
  });
});
