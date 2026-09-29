import { describe, it, expect } from 'vitest';
import { buildStartArgs, type Turn, type TurnDispatch } from '@/sidepanel/state/conversation';
import { asLangIdUnsafe } from '@/shared/brands';

const EN = asLangIdUnsafe('en');
const ES = asLangIdUnsafe('es');
const FR = asLangIdUnsafe('fr');
const reuse: TurnDispatch = { sourceLang: ES, targetLang: EN, stream: true };

function user(over: Partial<Turn> = {}): Turn {
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
    const args = buildStartArgs(user(), { requestId: 'r1', reuse });
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
    const args = buildStartArgs(user({ kind: 'explain' }), { requestId: 'r', reuse });
    expect(args.task).toBe('explain');
    expect(args.explain).toBe(true);
    expect(buildStartArgs(user({ kind: 'reword' }), { requestId: 'r', reuse }).task).toBe('reword');
  });

  it('a seed overrides the pair, the task and adds the refinement', () => {
    const args = buildStartArgs(user({ kind: 'reword' }), {
      requestId: 'r',
      reuse,
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
      seed: { task: 'translate' },
    });
    expect(args.task).toBeUndefined();
    expect(args.explain).toBe(false);
  });

  it('history rides along for text and is dropped for an image', () => {
    const history = [{ role: 'user' as const, content: 'earlier' }];
    expect(buildStartArgs(user(), { requestId: 'r', reuse, history }).conversationHistory).toBe(
      history,
    );
    const image = buildStartArgs(user({ imageDataUrl: 'data:image/png;base64,AA' }), {
      requestId: 'r',
      reuse,
      history,
    });
    expect(image.conversationHistory).toBeUndefined();
    expect(image.imageUrl).toBe('data:image/png;base64,AA');
  });

  it('an image-translate turn re-runs the vision pass as translate', () => {
    const args = buildStartArgs(
      user({
        kind: 'image-translate',
        content: '[image]',
        imageDataUrl: 'data:image/png;base64,AA',
      }),
      { requestId: 'r', reuse },
    );
    expect(args.task).toBeUndefined();
    expect(args.explain).toBe(false);
  });

  it('tone and context appear only when given', () => {
    const bare = buildStartArgs(user(), { requestId: 'r', reuse, tone: undefined, context: null });
    expect('tone' in bare).toBe(false);
    expect('context' in bare).toBe(false);
    const full = buildStartArgs(user(), {
      requestId: 'r',
      reuse,
      tone: 'formal',
      context: { pageTitle: 't' },
    });
    expect(full.tone).toBe('formal');
    expect(full.context?.pageTitle).toBe('t');
  });
});
