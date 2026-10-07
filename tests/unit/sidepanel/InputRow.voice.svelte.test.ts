// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { toastStore } from '@/shared/components/toastStore';
import { composerProps } from './_composer';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  FakeRecognition.lastInstance = null;
  document.body.innerHTML = '';
});

/** Opens the Add menu from the keyboard; its items render in a portal. */
async function openAdd(container: HTMLElement): Promise<void> {
  const add = container.querySelector<HTMLElement>('[data-ega-add]');
  if (!add) throw new Error('Add missing');
  await fireEvent.keyDown(add, { key: 'Enter' });
  await waitFor(() => {
    if (!document.querySelector('[data-ega-mic]')) throw new Error('menu not open');
  });
}

async function dictate(props = composerProps()): Promise<{ container: HTMLElement }> {
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  const { container } = render(InputRow, { props });
  await openAdd(container);
  await fireEvent.click(document.querySelector('[data-ega-mic]') as HTMLElement);
  return { container };
}

const stopButton = (c: HTMLElement): HTMLElement | null =>
  c.querySelector<HTMLElement>('[data-ega-add][aria-label="Stop dictation"]');

describe('dictation lives in the Add menu', () => {
  it('with no speech API there is no dictate item', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    const { container } = render(InputRow, { props: composerProps() });
    expect(container.querySelector('[data-ega-add]')?.getAttribute('aria-label')).toBe(
      'Attach image',
    );
  });

  it('the webkit-prefixed API counts too', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: composerProps() });
    expect(container.querySelector('[data-ega-add]')?.getAttribute('aria-label')).toBe('Add');
    await openAdd(container);
    expect(document.querySelector('[data-ega-attach-image]')?.textContent).toContain(
      'Attach image…',
    );
  });

  it('names the language it listens in, and listens in it', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: { ...composerProps(), sourceLang: 'es' } });
    await openAdd(container);
    expect(document.querySelector('[data-ega-mic]')?.textContent).toContain('Dictate in Spanish');
    await fireEvent.click(document.querySelector('[data-ega-mic]') as HTMLElement);
    expect(FakeRecognition.lastInstance?.lang).toBe('es');
    expect(FakeRecognition.lastInstance?.start).toHaveBeenCalledTimes(1);
  });

  it('falls back to the browser language for Auto-detect and for a variety id', async () => {
    await dictate();
    expect(FakeRecognition.lastInstance?.lang).toBe(navigator.language);
    document.body.innerHTML = '';
    await dictate({ ...composerProps(), sourceLang: 'arabizi' });
    expect(FakeRecognition.lastInstance?.lang).toBe(navigator.language);
  });

  it('Add becomes Stop dictation in the same place, says Listening…, and stops', async () => {
    const { container } = await dictate();
    const stop = stopButton(container);
    expect(stop).not.toBeNull();
    expect(container.textContent).toContain('Listening…');
    const instance = FakeRecognition.lastInstance;
    await fireEvent.click(stop as HTMLElement);
    expect(instance?.stop).toHaveBeenCalledTimes(1);
    instance?.onend?.();
    await waitFor(() => expect(stopButton(container)).toBeNull());
  });

  it('appends what was heard, with a space after earlier text', async () => {
    const { container } = await dictate({ ...composerProps(), value: 'prior text' });
    FakeRecognition.lastInstance?.onresult?.({ results: [[{ transcript: 'appended' }]] });
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    await vi.waitFor(() => expect(ta.value).toBe('prior text appended'));
  });

  it('a stale end from an earlier session does not stop the current one', async () => {
    const { container } = await dictate();
    const first = FakeRecognition.lastInstance;
    first?.onend?.();
    await waitFor(() => expect(stopButton(container)).toBeNull());
    await openAdd(container);
    await fireEvent.click(document.querySelector('[data-ega-mic]') as HTMLElement);
    expect(stopButton(container)).not.toBeNull();
    first?.onend?.();
    // Flushed first: a waitFor would pass on its first check, before the DOM caught up.
    await tick();
    expect(stopButton(container)).not.toBeNull();
  });
});

describe('dictation keeps keyboard focus in the composer', () => {
  it('starting from the Add menu puts focus on Stop dictation', async () => {
    const { container } = await dictate();
    await waitFor(() => expect(document.activeElement).toBe(stopButton(container)));
  });

  it('when listening ends, focus goes back to Add', async () => {
    const { container } = await dictate();
    const stop = await waitFor(() => {
      const s = stopButton(container);
      if (!s) throw new Error('Stop not shown');
      return s;
    });
    stop.focus();
    FakeRecognition.lastInstance?.onend?.();
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Add'));
  });
});

describe('dictation failures are spoken about', () => {
  it('names a blocked microphone, and Add comes back', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container } = await dictate();
    FakeRecognition.lastInstance?.onerror?.({ error: 'not-allowed' });
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Microphone access is blocked/);
    await waitFor(() => expect(stopButton(container)).toBeNull());
  });

  it('says when it heard nothing, and stays quiet when the user pressed Stop', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    await dictate();
    FakeRecognition.lastInstance?.onerror?.({ error: 'aborted' });
    expect(push).not.toHaveBeenCalled();
    FakeRecognition.lastInstance?.onerror?.({ error: 'no-speech' });
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Nothing was heard/);
  });
});

// Decision D53: the menu items carry the specifics, so "Attach or dictate" was false whenever an item was missing.
describe('the Add button has one name and one tooltip', () => {
  it('is "Add" in both, when sending and when changing a reply', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    for (const mode of [{ kind: 'send' as const }, { kind: 'refine' as const, turnId: 'a1' }]) {
      const { container, unmount } = render(InputRow, { props: { ...composerProps(), mode } });
      const add = container.querySelector('[data-ega-add]');
      expect(add?.getAttribute('aria-label'), mode.kind).toBe('Add');
      expect(add?.getAttribute('data-tooltip'), mode.kind).toBe('Add');
      unmount();
    }
  });
});
