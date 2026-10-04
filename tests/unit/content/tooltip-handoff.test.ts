import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escalateToSidepanel } from '@/content/tooltip/handoff';
import { chromeMock } from '@tests/mocks/chrome';
import { setSettings } from '@/content/settings-cache';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

describe('escalateToSidepanel', () => {
  let lastMessage: { kind: string; handoff?: Record<string, unknown> } | null = null;

  beforeEach(() => {
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

  it('open-panel opens the panel with no handoff, since a failed image has nothing to hand over', async () => {
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
