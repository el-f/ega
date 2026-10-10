import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  dispatchImageTranslate,
  type ImageTranslateDispatchDeps,
} from '@/background/imageTranslateDispatch';
import type { Msg } from '@/shared/messages';
import type { Settings, TranslationChunk } from '@/shared/types';

const tooltipSettings = { imageTranslateSurface: 'tooltip' } as unknown as Settings;

function baseDeps(overrides: Partial<ImageTranslateDispatchDeps> = {}): ImageTranslateDispatchDeps {
  return {
    tabId: 7,
    imageUrl: 'https://i.redd.it/x.png',
    requestId: 'req-1',
    getSettings: async () => tooltipSettings,
    router: {
      handleImageTranslate: vi.fn(async (_req, onChunk: (c: TranslationChunk) => void) => {
        onChunk({ type: 'delta', requestId: 'req-1', text: 'hi' });
        onChunk({
          type: 'done',
          requestId: 'req-1',
          confidence: 0.9,
        } as unknown as TranslationChunk);
      }),
      handleImageExplain: vi.fn(async () => {}),
    },
    broadcast: vi.fn(),
    sendToTab: vi.fn(),
    logger: { error: vi.fn() },
    ...overrides,
  };
}

function sentKinds(sendToTab: Mock): string[] {
  return sendToTab.mock.calls.map((c) => (c[1] as Msg).kind);
}

describe('dispatchImageTranslate tooltip surface — pending message', () => {
  it('passes a custom task through vision and preserves the completed answer snapshot', async () => {
    const sendToTab = vi.fn();
    const answer = {
      spec: {
        id: 'custom:c-image',
        version: 1,
        join: 'after-build' as const,
        fields: [
          {
            key: 'answer',
            label: 'Objects',
            kind: 'list' as const,
            role: 'main' as const,
            required: true,
          },
        ],
      },
      fields: { answer: ['A cat'] },
    };
    const handleImageTranslate = vi.fn<
      ImageTranslateDispatchDeps['router']['handleImageTranslate']
    >(async (_req, emit) => {
      emit({
        type: 'done',
        requestId: 'req-1',
        text: 'A cat',
        answer,
        notes: [{ key: 'reason', label: 'Reason', text: 'Seen' }],
      });
    });
    await dispatchImageTranslate(
      baseDeps({
        task: 'c-image',
        sendToTab,
        router: { handleImageTranslate, handleImageExplain: vi.fn(async () => {}) },
      }),
    );
    expect(handleImageTranslate.mock.calls[0]?.[0]).toMatchObject({ task: 'c-image' });
    expect(sendToTab.mock.calls.at(-1)?.[1]).toMatchObject({
      task: 'c-image',
      answer,
      notes: [{ label: 'Reason' }],
    });
  });
  it('sends content:image-translate-pending before the vision call starts', async () => {
    const order: string[] = [];
    const sendToTab = vi.fn((_tabId: number, msg: Msg) => {
      order.push(msg.kind);
    });
    const handleImageTranslate = vi.fn(async () => {
      order.push('vision');
    });
    const deps = baseDeps({
      sendToTab,
      router: { handleImageTranslate, handleImageExplain: vi.fn(async () => {}) },
    });
    await dispatchImageTranslate(deps);

    expect(order[0]).toBe('content:image-translate-pending');
    expect(order.indexOf('vision')).toBeGreaterThan(0);
  });

  it('pending carries the same requestId + imageUrl as the result', async () => {
    const sendToTab = vi.fn();
    await dispatchImageTranslate(baseDeps({ sendToTab }));

    const pending = sendToTab.mock.calls
      .map((c) => c[1] as Msg)
      .find(
        (m): m is Extract<Msg, { kind: 'content:image-translate-pending' }> =>
          m.kind === 'content:image-translate-pending',
      );
    expect(pending).toMatchObject({ requestId: 'req-1', imageUrl: 'https://i.redd.it/x.png' });
    expect(sentKinds(sendToTab)).toEqual([
      'content:image-translate-pending',
      'content:image-translate-result',
    ]);
  });

  it('the error path also gets the pending message first', async () => {
    const sendToTab = vi.fn();
    const deps = baseDeps({
      sendToTab,
      router: {
        handleImageTranslate: vi.fn(async () => {
          throw new Error('vision blew up');
        }),
        handleImageExplain: vi.fn(async () => {}),
      },
    });
    await dispatchImageTranslate(deps);

    expect(sentKinds(sendToTab)).toEqual([
      'content:image-translate-pending',
      'content:image-translate-result',
    ]);
    const result = sendToTab.mock.calls
      .map((c) => c[1] as Msg)
      .find(
        (m): m is Extract<Msg, { kind: 'content:image-translate-result' }> =>
          m.kind === 'content:image-translate-result',
      );
    expect(result?.error).toMatchObject({ code: 'UNKNOWN', message: 'vision blew up' });
  });

  it('a rate-limit error keeps its Retry-After for the tooltip countdown', async () => {
    const sendToTab = vi.fn();
    const deps = baseDeps({
      sendToTab,
      router: {
        handleImageTranslate: vi.fn(async (_req, onChunk: (c: TranslationChunk) => void) => {
          onChunk({
            type: 'error',
            requestId: 'req-1',
            code: 'RATE_LIMIT',
            message: 'slow down',
            retryAfterMs: 5000,
          });
        }),
        handleImageExplain: vi.fn(async () => {}),
      },
    });
    await dispatchImageTranslate(deps);

    const result = sendToTab.mock.calls
      .map((c) => c[1] as Msg)
      .find(
        (m): m is Extract<Msg, { kind: 'content:image-translate-result' }> =>
          m.kind === 'content:image-translate-result',
      );
    expect(result?.error).toEqual({ code: 'RATE_LIMIT', message: 'slow down', retryAfterMs: 5000 });
  });

  it('sidepanel surface sends no tab messages at all', async () => {
    const sendToTab = vi.fn();
    const deps = baseDeps({
      sendToTab,
      getSettings: async () => ({ imageTranslateSurface: 'sidepanel' }) as unknown as Settings,
    });
    await dispatchImageTranslate(deps);
    expect(sendToTab).not.toHaveBeenCalled();
  });
});

describe('dispatchImageTranslate tooltip surface — explain arm', () => {
  it('forwards the explanation, the detected variety and the image marker to the tab', async () => {
    const sendToTab = vi.fn();
    await dispatchImageTranslate(
      baseDeps({
        task: 'explain',
        sendToTab,
        router: {
          handleImageTranslate: vi.fn(async () => {}),
          handleImageExplain: vi.fn(async (_req, onChunk: (c: TranslationChunk) => void) => {
            onChunk({
              type: 'delta',
              requestId: 'req-1',
              text: 'Earlier',
            });
            onChunk({
              type: 'done',
              requestId: 'req-1',
              text: 'hi',
              confidence: 0.9,
              explain: 'a greeting',
              detectedLang: 'arabizi',
              detectedDetail: 'Levantine',
              usedImage: true,
            });
          }),
        },
      }),
    );

    const result = sendToTab.mock.calls
      .map((c) => c[1] as Msg)
      .find(
        (m): m is Extract<Msg, { kind: 'content:image-translate-result' }> =>
          m.kind === 'content:image-translate-result',
      );
    expect(result).toMatchObject({
      translation: 'hi',
      confidence: 0.9,
      explain: 'a greeting',
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
      usedImage: true,
      task: 'explain',
    });
  });
});
