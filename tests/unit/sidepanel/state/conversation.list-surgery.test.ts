// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deleteTurnPair,
  dropLastUserExchange,
  dropOrphanHead,
  findEditableLastUserTurn,
  findRetryTarget,
  truncateFrom,
} from '@/sidepanel/state/conversation';
import type { Turn } from '@/sidepanel/state/conversation';

function user(id: string, createdAt = 1): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt, content: id };
}

function assistant(id: string, attachedToTurnId?: string, createdAt = 2): Turn {
  return {
    id,
    role: 'assistant',
    kind: 'translate',
    status: 'done',
    createdAt,
    content: id,
    ...(attachedToTurnId !== undefined ? { attachedToTurnId } : {}),
  };
}

const ids = (ts: readonly Turn[]): string[] => ts.map((t) => t.id);

describe('finding the user turn behind an answer', () => {
  const thread = [user('u1'), assistant('a1', 'u1'), user('u2'), assistant('a2', 'u2')];

  it('finds it', () => {
    expect(findRetryTarget(thread, 'a2')?.id).toBe('u2');
  });

  it('is null for an id nothing matches', () => {
    expect(findRetryTarget(thread, 'nope')).toBeNull();
  });

  it('is null when the id names a user turn, not an answer', () => {
    expect(findRetryTarget(thread, 'u1')).toBeNull();
  });

  it('is null for an answer with no link', () => {
    expect(findRetryTarget([assistant('lone')], 'lone')).toBeNull();
  });

  it('is null when the link points at something that is not a user turn', () => {
    const broken = [assistant('a0'), assistant('a1', 'a0')];

    expect(findRetryTarget(broken, 'a1')).toBeNull();
  });
});

describe('the last user turn', () => {
  it('is the newest one, not the first', () => {
    const thread = [user('u1'), assistant('a1', 'u1'), user('u2')];

    expect(findEditableLastUserTurn(thread)?.id).toBe('u2');
  });

  it('is found even when answers sit after it', () => {
    const thread = [user('u1'), user('u2'), assistant('a2', 'u2')];

    expect(findEditableLastUserTurn(thread)?.id).toBe('u2');
  });

  it('is null in a thread with no user turn at all', () => {
    expect(findEditableLastUserTurn([assistant('a1')])).toBeNull();
    expect(findEditableLastUserTurn([])).toBeNull();
  });
});

describe('dropping the last exchange for an edit', () => {
  it('cuts the last user turn and everything after it', () => {
    const thread = [user('u1'), assistant('a1', 'u1'), user('u2'), assistant('a2', 'u2')];

    expect(ids(dropLastUserExchange(thread))).toEqual(['u1', 'a1']);
  });

  it('cuts back to empty when the last user turn is the first turn', () => {
    expect(ids(dropLastUserExchange([user('u1'), assistant('a1', 'u1')]))).toEqual([]);
  });

  it('is a no-op copy when there is no user turn to cut', () => {
    const thread = [assistant('a1')];

    const out = dropLastUserExchange(thread);

    expect(ids(out)).toEqual(['a1']);
    expect(out).not.toBe(thread);
  });
});

describe('deleting a turn takes its partner with it', () => {
  const thread = [user('u1'), assistant('a1', 'u1'), user('u2'), assistant('a2', 'u2')];

  it('deleting the question removes every answer attached to it', () => {
    const many = [user('u1'), assistant('a1', 'u1'), assistant('a1b', 'u1'), user('u2')];

    expect(ids(deleteTurnPair(many, 'u1'))).toEqual(['u2']);
  });

  it('deleting the answer removes its question', () => {
    expect(ids(deleteTurnPair(thread, 'a2'))).toEqual(['u1', 'a1']);
  });

  it('deleting an unattached answer takes nothing else', () => {
    const lone = [user('u1'), assistant('lone')];

    expect(ids(deleteTurnPair(lone, 'lone'))).toEqual(['u1']);
  });

  it('is a no-op copy for an id nothing matches', () => {
    const out = deleteTurnPair(thread, 'nope');

    expect(ids(out)).toEqual(ids(thread));
    expect(out).not.toBe(thread);
  });
});

describe('an answer whose question was trimmed away', () => {
  const original = [user('u1'), assistant('a1', 'u1'), user('u2'), assistant('a2', 'u2')];

  it('is dropped from the head of the trimmed list', () => {
    const trimmed = original.slice(1);

    expect(ids(dropOrphanHead(trimmed, original))).toEqual(['u2', 'a2']);
  });

  it('drops a run of them, and stops at the first turn that belongs', () => {
    const many = [user('u0'), assistant('a0', 'u0'), assistant('a0b', 'u0'), user('u1')];

    expect(ids(dropOrphanHead(many.slice(1), many))).toEqual(['u1']);
  });

  it('keeps a bare answer the thread always started with', () => {
    // Nothing was trimmed, so the leading answer is original, not orphaned.
    const started = [assistant('a1'), user('u1')];

    expect(ids(dropOrphanHead(started, started))).toEqual(['a1', 'u1']);
  });

  it('keeps an answer whose question survived the trim', () => {
    const trimmed = original.slice(2);

    expect(ids(dropOrphanHead(trimmed, original))).toEqual(['u2', 'a2']);
  });

  it('keeps a leading answer that never had a question', () => {
    const orig = [user('u0'), assistant('a0'), user('u1')];

    expect(ids(dropOrphanHead(orig.slice(1), orig))).toEqual(['a0', 'u1']);
  });
});

describe('truncating from a turn', () => {
  const thread = [user('u1'), assistant('a1', 'u1'), user('u2')];

  it('drops that turn and everything after it', () => {
    expect(ids(truncateFrom(thread, 'a1'))).toEqual(['u1']);
  });

  it('is a no-op copy for an unknown id', () => {
    const out = truncateFrom(thread, 'nope');

    expect(ids(out)).toEqual(ids(thread));
    expect(out).not.toBe(thread);
  });
});
