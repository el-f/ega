// The sent instructions are kept on the 20 newest replies, once per reply, and are the first thing a too-big turn loses.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { chromeMock } from '../../../mocks/chrome';
import {
  MAX_TURN_BYTES,
  leanInstructions,
  loadThreadResult,
  saveThread,
} from '@/sidepanel/state/conversation-store';
import { threadKey } from '@/shared/saved-conversations';
import type { AssistantTurnData, Turn, Variant } from '@/sidepanel/state/conversation';
import type { ResultMeta } from '@/shared/types';

function meta(instructions?: string): ResultMeta {
  return {
    backendId: 'unknown',
    cacheHit: false,
    latencyMs: 5,
    ...(instructions !== undefined ? { instructions } : {}),
  };
}

function reply(id: string, metas: (string | undefined)[], content = id): AssistantTurnData {
  const variants: Variant[] = metas.map((m, i) => ({
    id: `${id}:v${i + 1}`,
    status: 'done',
    content,
    meta: meta(m),
  }));
  const active = variants.length - 1;
  return {
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt: 2,
    content,
    meta: variants[active]?.meta as ResultMeta,
    variants,
    activeVariantIdx: active,
  };
}

function user(id: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: id };
}

/** Every instruction text left in the thread, in order. */
function kept(turns: readonly Turn[]): string[] {
  const out: string[] = [];
  for (const t of turns) {
    if (t.role !== 'assistant') continue;
    if (t.variants === undefined) {
      if (t.meta?.instructions !== undefined) out.push(t.meta.instructions);
      continue;
    }
    for (const v of t.variants)
      if (v.meta?.instructions !== undefined) out.push(v.meta.instructions);
  }
  return out;
}

function strip(turns: readonly Turn[]): unknown {
  return JSON.parse(
    JSON.stringify(turns, (k, v: unknown) =>
      k === 'instructions' || k === 'instructionsLength' ? undefined : v,
    ),
  );
}

const thread = fc
  .array(
    fc.array(fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: undefined }), {
      minLength: 1,
      maxLength: 4,
    }),
    { maxLength: 30 },
  )
  .map((replies) => replies.flatMap((metas, i): Turn[] => [user(`u${i}`), reply(`a${i}`, metas)]));

describe('leanInstructions (I4)', () => {
  it('keeps at most 20, the newest ones, and changes nothing else', () => {
    fc.assert(
      fc.property(thread, (turns) => {
        const lean = leanInstructions(turns);
        const all = kept(turns);
        expect(kept(lean)).toEqual(all.slice(Math.max(0, all.length - 20)));
        expect(strip(lean)).toEqual(strip(turns));
        expect(leanInstructions(lean)).toEqual(lean);
      }),
    );
  });

  it('a turn with variants keeps the text on its variants only', () => {
    const [t] = leanInstructions([reply('a', ['one'])]) as AssistantTurnData[];
    expect(t?.meta?.instructions).toBeUndefined();
    expect(t?.variants?.[0]?.meta?.instructions).toBe('one');
  });
});

describe('save then load (I5)', () => {
  it('puts the active variant’s text back on the turn and stores each text once', async () => {
    const site = 'https://instr.test';
    const text = 'You are a translator. '.repeat(10);
    await saveThread(site, [user('u1'), reply('a1', ['older', text])]);
    const stored = JSON.stringify(chromeMock.storage.local._raw.get(threadKey(site)));
    expect(stored.split(text).length - 1).toBe(1);
    const loaded = (await loadThreadResult(site)).turns[1] as AssistantTurnData;
    expect(loaded.meta?.instructions).toBe(text);
    expect(loaded.variants?.[0]?.meta?.instructions).toBe('older');
  });

  it('drops a stored text that is not a string', async () => {
    const site = 'https://corrupt.test';
    await saveThread(site, [user('u1'), reply('a1', ['ok'])]);
    const blob = chromeMock.storage.local._raw.get(threadKey(site)) as {
      turns: AssistantTurnData[];
    };
    const v = blob.turns[1]?.variants?.[0];
    if (v?.meta) (v.meta as unknown as Record<string, unknown>)['instructions'] = { html: '<img>' };
    const loaded = (await loadThreadResult(site)).turns[1] as AssistantTurnData;
    expect(loaded.variants?.[0]?.meta && 'instructions' in loaded.variants[0].meta).toBe(false);
    expect(loaded.meta?.instructions).toBeUndefined();
  });
});

describe('an oversized turn (I6)', () => {
  it('loses its instructions before it loses its variants', async () => {
    const site = 'https://big-instr.test';
    const answer = 'x'.repeat(Math.floor(MAX_TURN_BYTES / 4));
    const huge = 'p'.repeat(Math.floor(MAX_TURN_BYTES / 2));
    const t = reply('a1', [huge, 'small'], answer);
    await saveThread(site, [user('u1'), t]);
    const loaded = (await loadThreadResult(site)).turns[1] as AssistantTurnData;
    expect(loaded.variants).toHaveLength(2);
    expect(kept([loaded])).toEqual([]);
  });
});
