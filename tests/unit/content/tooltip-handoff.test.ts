import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escalateToSidepanel } from '@/content/tooltip/handoff';
import { chromeMock } from '@tests/mocks/chrome';
import { setSettings } from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { IMAGE_DATA_URL_MAX_CHARS } from '@/shared/constants';
import type { ErrCode } from '@/shared/types';

const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@/content/toast', () => toastMock);

describe('escalateToSidepanel', () => {
  let lastMessage: { kind: string; handoff?: Record<string, unknown> } | null = null;

  beforeEach(() => {
    toastMock.showToast.mockClear();
    lastMessage = null;
    chromeMock.runtime.sendMessage = vi.fn(async (msg: unknown) => {
      lastMessage = msg as { kind: string; handoff?: Record<string, unknown> };
      return { ok: true };
    });
  });

  it('sends ui:open-sidepanel with the handoff payload inline', async () => {
    await escalateToSidepanel({
      subKind: 'continue',
      text: 'Hola',
      sourceLang: 'es',
      targetLang: 'en',
    });
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(lastMessage?.kind).toBe('ui:open-sidepanel');
    expect(lastMessage?.handoff).toMatchObject({
      sourceText: 'Hola',
      sourceLang: 'es',
      targetLang: 'en',
      task: 'translate',
      tone: 'neutral',
    });
  });

  it('without a tone, hands off the default tone', async () => {
    setSettings({ ...DEFAULT_SETTINGS, defaultTone: 'formal' });
    await escalateToSidepanel({
      subKind: 'continue',
      text: 'Hola',
      sourceLang: 'es',
      targetLang: 'en',
    });
    expect(lastMessage?.handoff?.['tone']).toBe('formal');
    setSettings({ ...DEFAULT_SETTINGS });
  });

  it('forwards the requested task on the handoff payload', async () => {
    await escalateToSidepanel({
      subKind: 'pin',
      text: 'Bonjour',
      sourceLang: 'fr',
      targetLang: 'en',
      task: 'explain',
      tone: 'neutral',
      response: 'Hello',
    });
    expect(lastMessage?.handoff?.['task']).toBe('explain');
    expect(lastMessage?.handoff?.['sourceText']).toBe('Bonjour');
  });

  it('open-image with an image sends the image as the source, not the answer', async () => {
    // ocrText is the vision ANSWER. Sending it as sourceText made the user turn and
    // the assistant turn the same string. The panel renders the thumbnail instead.
    await escalateToSidepanel({
      subKind: 'open-image',
      text: '',
      sourceLang: 'auto',
      targetLang: 'en',
      imageDataUrl: 'data:image/png;base64,xxx',
      ocrText: 'Welcome to the group chat',
    });
    expect(lastMessage?.handoff?.['sourceText']).toBe('[image]');
    // The answer still rides along for the assistant turn.
    expect(lastMessage?.handoff?.['ocrText']).toBe('Welcome to the group chat');
  });

  it('open-image with no image still falls back to ocrText', async () => {
    // Without a thumbnail there is nothing to show, and an empty sourceText
    // would be dropped by the drain's empty-sourceText guard.
    await escalateToSidepanel({
      subKind: 'open-image',
      text: '',
      sourceLang: 'auto',
      targetLang: 'en',
      ocrText: 'Welcome to the group chat',
    });
    expect(lastMessage?.handoff?.['sourceText']).toBe('Welcome to the group chat');
  });

  it('open-image leaves a non-empty text in place', async () => {
    // A non-empty `text` (a selection made before the image action) wins over ocrText.
    await escalateToSidepanel({
      subKind: 'open-image',
      text: 'pre-selected source',
      sourceLang: 'auto',
      targetLang: 'en',
      ocrText: 'OCR fallback',
    });
    expect(lastMessage?.handoff?.['sourceText']).toBe('pre-selected source');
  });

  it('reports an SW open failure as false', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('asleep'));
    await expect(
      escalateToSidepanel({
        subKind: 'open-image',
        text: 'OCR text',
        sourceLang: 'auto',
        targetLang: 'en',
        imageDataUrl: 'data:image/png;base64,xxx',
        ocrText: 'OCR text',
      }),
    ).resolves.toBe(false);
  });

  it('reports an ok reply as true', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true });
    await expect(
      escalateToSidepanel({
        subKind: 'continue',
        text: 'Hola',
        sourceLang: 'es',
        targetLang: 'en',
      }),
    ).resolves.toBe(true);
  });

  it('open-panel carries the failed image to the composer, marked to wait unsent', async () => {
    await escalateToSidepanel({
      subKind: 'open-panel',
      text: '',
      sourceLang: 'auto',
      targetLang: 'en',
      imageDataUrl: 'https://example.test/sign.png',
    });
    expect(lastMessage?.handoff).toMatchObject({
      imageDataUrl: 'https://example.test/sign.png',
      attachImage: true,
    });
    // Nothing for the panel to send: no answer, no OCR text.
    expect(lastMessage?.handoff?.['ocrText']).toBeUndefined();
    expect(lastMessage?.handoff?.['response']).toBeUndefined();
  });

  it('open-panel with no image just opens the panel', async () => {
    await expect(
      escalateToSidepanel({
        subKind: 'open-panel',
        text: '',
        sourceLang: 'auto',
        targetLang: 'en',
      }),
    ).resolves.toBe(true);
    expect(lastMessage).toEqual({ kind: 'ui:open-sidepanel' });
  });

  describe('open-panel leaves an image behind when the panel cannot use it', () => {
    const openPanel = (imageDataUrl: string, errorCode?: ErrCode): Promise<boolean> =>
      escalateToSidepanel({
        subKind: 'open-panel',
        text: '',
        sourceLang: 'auto',
        targetLang: 'en',
        imageDataUrl,
        ...(errorCode ? { errorCode } : {}),
      });
    const leftBehind = (): boolean =>
      toastMock.showToast.mock.calls.some(([m]) =>
        /attach the image in the side panel/i.test(String(m)),
      );

    it.each([
      ['an SVG data URL', 'data:image/svg+xml;base64,PHN2Zz4='],
      ['a script URL', 'javascript:alert(1)'],
      ['a metadata address', 'http://169.254.169.254/a.png'],
      [
        'a data URL over the panel reader cap',
        'data:image/png;base64,' + 'A'.repeat(IMAGE_DATA_URL_MAX_CHARS),
      ],
    ])('%s: opens the panel without it and says to attach it there', async (_, src) => {
      await expect(openPanel(src)).resolves.toBe(true);
      expect(lastMessage).toEqual({ kind: 'ui:open-sidepanel' });
      expect(leftBehind()).toBe(true);
    });

    it('an image the model cannot read is not attached: a re-send would fail the same way', async () => {
      await expect(openPanel('https://example.test/a.png', 'IMAGE_UNSUPPORTED')).resolves.toBe(
        true,
      );
      expect(lastMessage).toEqual({ kind: 'ui:open-sidepanel' });
      expect(leftBehind()).toBe(true);
    });

    it.each<ErrCode>(['NETWORK', 'TIMEOUT', 'SERVER', 'AUTH', 'QUOTA', 'RATE_LIMIT', 'NO_BACKEND'])(
      'a %s failure still attaches the image: the next try can work',
      async (code) => {
        await expect(openPanel('https://example.test/a.png', code)).resolves.toBe(true);
        expect(lastMessage?.handoff).toMatchObject({ attachImage: true });
        expect(toastMock.showToast).not.toHaveBeenCalled();
      },
    );

    it('surfaces the worker leaving the image behind', async () => {
      chromeMock.runtime.sendMessage = vi.fn(async (msg: unknown) => {
        lastMessage = msg as { kind: string; handoff?: Record<string, unknown> };
        return { ok: true, imageLeftBehind: true };
      });
      await expect(openPanel('https://example.test/a.png')).resolves.toBe(true);
      expect(lastMessage?.handoff).toMatchObject({ attachImage: true });
      expect(leftBehind()).toBe(true);
    });

    it('a panel that did not open shows no attach hint', async () => {
      chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: false });
      await expect(openPanel('javascript:alert(1)')).resolves.toBe(false);
      expect(toastMock.showToast).not.toHaveBeenCalled();
    });
  });

  it('reports a not-ok reply as false', async () => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: false });
    await expect(
      escalateToSidepanel({
        subKind: 'continue',
        text: 'Hola',
        sourceLang: 'es',
        targetLang: 'en',
      }),
    ).resolves.toBe(false);
  });
});
