// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { toastStore } from '@/shared/components/toastStore';

class FakeRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  static lastInstance: FakeRecognition | null = null;
  constructor() {
    FakeRecognition.lastInstance = this;
  }
  start = vi.fn();
  stop = vi.fn();
}

const baseProps = () => ({
  value: '',
  sourceLang: 'auto',
  targetLang: 'en',
  swapDisabled: false,
  task: 'translate' as const,
  tone: 'neutral' as const,
  usesTone: false,
  varieties: [],
  pageContextLevel: 'minimal' as const,
  attachedImage: null,
  turns: [] as const,
  inflight: false,
  streaming: true,
  onSwap: vi.fn(),
  onContextLevelChange: vi.fn(),
  onAttachImage: vi.fn(),
  onClearAttachedImage: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onToggleStreaming: vi.fn(),
});

describe('InputRow voice dictation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.lastInstance = null;
  });

  it('hides mic button when SpeechRecognition unavailable', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    const { container } = render(InputRow, { props: baseProps() });
    expect(container.querySelector('[data-ega-mic]')).toBeNull();
  });

  it('shows mic button when SpeechRecognition available', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    expect(container.querySelector('[data-ega-mic]')).not.toBeNull();
  });

  it('shows mic button when webkitSpeechRecognition available', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    expect(container.querySelector('[data-ega-mic]')).not.toBeNull();
  });

  it('mic button names the language it will listen in', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]');
    expect(btn?.getAttribute('aria-label')).toBe('Dictate in English');
    expect(btn?.getAttribute('data-tooltip')).toBe('Dictate in English');
  });

  it('listens in the chosen source language', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: { ...baseProps(), sourceLang: 'es' } });
    const btn = container.querySelector('[data-ega-mic]');
    expect(btn?.getAttribute('aria-label')).toBe('Dictate in Spanish');
    if (btn) await fireEvent.click(btn);
    expect(FakeRecognition.lastInstance?.lang).toBe('es');
  });

  it('falls back to the browser language when the source is Auto-detect', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]');
    if (btn) await fireEvent.click(btn);
    expect(FakeRecognition.lastInstance?.lang).toBe(navigator.language);
  });

  it('never hands a preset id to the recogniser', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: { ...baseProps(), sourceLang: 'arabizi' } });
    const btn = container.querySelector('[data-ega-mic]');
    if (btn) await fireEvent.click(btn);
    expect(FakeRecognition.lastInstance?.lang).toBe(navigator.language);
  });

  it('swaps the glyph while recording so the state survives forced colors', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]');
    expect(container.querySelector('[data-ega-mic] svg')?.getAttribute('class')).toContain(
      'lucide-mic',
    );
    if (btn) await fireEvent.click(btn);
    const cls = container.querySelector('[data-ega-mic] svg')?.getAttribute('class') ?? '';
    expect(cls).toContain('circle-stop');
    expect(cls).not.toContain('lucide-mic');
  });

  it('mic button has aria-pressed=false initially', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking mic starts recognition', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;
    await fireEvent.click(btn);
    expect(FakeRecognition.lastInstance?.start).toHaveBeenCalledTimes(1);
  });

  it('aria-pressed becomes true after clicking to start', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('appends transcript to empty value', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: { ...baseProps(), value: '' } });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;
    await fireEvent.click(btn);
    FakeRecognition.lastInstance?.onresult?.({ results: [[{ transcript: 'hello world' }]] });
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    await vi.waitFor(() => expect(ta.value).toBe('hello world'));
  });

  it('appends transcript with space separator when value is non-empty', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: { ...baseProps(), value: 'prior text' } });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;
    await fireEvent.click(btn);
    FakeRecognition.lastInstance?.onresult?.({ results: [[{ transcript: 'appended' }]] });
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    await vi.waitFor(() => expect(ta.value).toBe('prior text appended'));
  });

  it('onend callback sets recognizing=false (aria-pressed back to false)', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    FakeRecognition.lastInstance?.onend?.();
    await vi.waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('false'));
  });

  it('clicking mic while recognizing stops recognition', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;
    await fireEvent.click(btn);
    const instance = FakeRecognition.lastInstance;
    await fireEvent.click(btn);
    expect(instance?.stop).toHaveBeenCalledTimes(1);
  });

  it('stale onend from first instance does not reset recognizing after second start', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const btn = container.querySelector('[data-ega-mic]') as HTMLElement;

    // First start — capture the instance before the second start replaces recog
    await fireEvent.click(btn);
    const first = FakeRecognition.lastInstance;
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    // Stop fires recog.stop(); onend hasn't fired yet (no real API in jsdom).
    await fireEvent.click(btn);
    // Simulate the current instance's onend — recognizing goes false
    first?.onend?.();
    await vi.waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('false'));

    // Second start — new instance created, recognizing=true
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    // Stale onend from the FIRST instance fires — must NOT flip recognizing=false
    first?.onend?.();
    await vi.waitFor(() => {
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });
  });
});

describe('InputRow dictation failures are spoken about', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.lastInstance = null;
  });

  async function startDictation() {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const mic = container.querySelector('[data-ega-mic]');
    if (!mic) throw new Error('mic not found');
    await fireEvent.click(mic);
    const instance = FakeRecognition.lastInstance;
    if (!instance) throw new Error('recogniser not constructed');
    return { container, mic, instance };
  }

  it('names a blocked microphone', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { mic, instance } = await startDictation();
    instance.onerror?.({ error: 'not-allowed' });
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Microphone access is blocked/);
    await vi.waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('false'));
  });

  it('says when it heard nothing', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { instance } = await startDictation();
    instance.onerror?.({ error: 'no-speech' });
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Nothing was heard/);
  });

  it('stays quiet when the user pressed Stop', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { instance } = await startDictation();
    instance.onerror?.({ error: 'aborted' });
    expect(push).not.toHaveBeenCalled();
  });
});
