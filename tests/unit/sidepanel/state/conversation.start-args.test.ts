import { describe, it, expect } from 'vitest';
import {
  buildStartArgs,
  type Turn,
  type TurnDispatch,
  type UserTurnData,
} from '@/sidepanel/state/conversation';
import { asLangIdUnsafe } from '@/shared/brands';

const EN = asLangIdUnsafe('en');
const ES = asLangIdUnsafe('es');
const FR = asLangIdUnsafe('fr');
const reuse: TurnDispatch = { sourceLang: ES, targetLang: EN, stream: true };

function user(over: Partial<UserTurnData> = {}): UserTurnData {
  return {
    id: 'u1',
    role: 'user',
    kind: 'translate',
    status: 'idle',
    content: 'hola',
    createdAt: 1,
    dispatch: reuse,
    ...over,
  };
}

describe('buildStartArgs — one request shape for send, retry and every variant', () => {
  it('a plain translate carries the dispatch pair and no task', () => {
    const args = buildStartArgs(user(), { requestId: 'r1', reuse, thread: 'none' });
    expect(args).toEqual({
      requestId: 'r1',
      text: 'hola',
      sourceLang: ES,
      targetLang: EN,
      explain: false,
      stream: true,
    });
  });

  it('the kind decides task and explain together', () => {
    const args = buildStartArgs(user({ kind: 'explain' }), {
      requestId: 'r',
      reuse,
      thread: 'none',
    });
    expect(args.task).toBe('explain');
    expect(args.explain).toBe(true);
    expect(
      buildStartArgs(user({ kind: 'reword' }), { requestId: 'r', reuse, thread: 'none' }).task,
    ).toBe('reword');
  });

  it('a seed overrides the pair, the task and adds the refinement', () => {
    const args = buildStartArgs(user({ kind: 'reword' }), {
      requestId: 'r',
      reuse,
      thread: 'none',
      seed: { sourceLang: EN, targetLang: FR, task: 'explain', refinementBody: 'shorter' },
    });
    expect(args).toMatchObject({
      sourceLang: EN,
      targetLang: FR,
      task: 'explain',
      explain: true,
      refinement: 'shorter',
    });
  });

  it('a seed that re-runs as translate sends no task', () => {
    const args = buildStartArgs(user({ kind: 'explain' }), {
      requestId: 'r',
      reuse,
      thread: 'none',
      seed: { task: 'translate' },
    });
    expect(args.task).toBeUndefined();
    expect(args.explain).toBe(false);
  });

  describe('history: the turns before the user turn, decided here for every caller', () => {
    const earlier = user({ id: 'u0', content: 'earlier' });
    const answer: Turn = {
      id: 'a0',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'answer',
      createdAt: 1,
      attachedToTurnId: 'u0',
    };
    const later = user({ id: 'u2', content: 'later' });

    it('takes what comes before the user turn and never what comes after', () => {
      const args = buildStartArgs(user(), {
        requestId: 'r',
        reuse,
        thread: [earlier, answer, user(), later],
      });
      expect(args.conversationHistory).toEqual([
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'answer' },
      ]);
    });

    it("sends none for 'none', for a user turn not in the thread, and for an image", () => {
      const none = buildStartArgs(user(), { requestId: 'r', reuse, thread: 'none' });
      expect(none.conversationHistory).toBeUndefined();
      const stray = buildStartArgs(user({ id: 'elsewhere' }), {
        requestId: 'r',
        reuse,
        thread: [earlier, answer],
      });
      expect(stray.conversationHistory).toBeUndefined();
      const imageTurn = user({ imageDataUrl: 'data:image/png;base64,AA' });
      const image = buildStartArgs(imageTurn, {
        requestId: 'r',
        reuse,
        thread: [earlier, answer, imageTurn],
      });
      expect(image.conversationHistory).toBeUndefined();
      expect(image.imageUrl).toBe('data:image/png;base64,AA');
    });
  });

  it('an image-translate turn re-runs the vision pass as translate', () => {
    const args = buildStartArgs(
      user({
        kind: 'image-translate',
        content: '[image]',
        imageDataUrl: 'data:image/png;base64,AA',
      }),
      { requestId: 'r', reuse, thread: 'none' },
    );
    expect(args.task).toBeUndefined();
    expect(args.explain).toBe(false);
  });

  it('tone and context appear only when given', () => {
    const bare = buildStartArgs(user(), {
      requestId: 'r',
      reuse,
      thread: 'none',
      tone: undefined,
      context: null,
    });
    expect('tone' in bare).toBe(false);
    expect('context' in bare).toBe(false);
    const full = buildStartArgs(user(), {
      requestId: 'r',
      reuse,
      thread: 'none',
      tone: 'formal',
      context: { pageTitle: 't' },
    });
    expect(full.tone).toBe('formal');
    expect(full.context?.pageTitle).toBe('t');
  });
});
