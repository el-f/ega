// @vitest-environment jsdom
// Ask about a reply, design Revision 2: the composer's Ask mode and the picker's Ask chip.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { toastStore } from '@/shared/components/toastStore';
import type { ComposerMode } from '@/sidepanel/state/thread-view';
import { composerProps } from './_composer';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
});
afterEach(() => vi.unstubAllGlobals());

const ASK: ComposerMode = { kind: 'ask', turnId: 'a1' };
const textarea = (c: HTMLElement): HTMLTextAreaElement =>
  c.querySelector<HTMLTextAreaElement>('#sp-text') as HTMLTextAreaElement;
const said = (c: HTMLElement): string => c.querySelector('[data-ega-mode-said]')?.textContent ?? '';

describe('Ask mode in the composer', () => {
  it('a banner replaces the chip, with Done asking and the ask placeholder', () => {
    const props = { ...composerProps(), mode: ASK, askLine: 'Asking about the reply: Hi there' };
    const { container } = render(InputRow, { props });
    expect(container.querySelector('[data-ega-mode-chip]')).toBeNull();
    const banner = container.querySelector('[data-ega-mode-banner]');
    expect(banner?.textContent).toContain('Asking about this reply');
    const x = banner?.querySelector('button');
    expect(x?.getAttribute('aria-label')).toBe('Done asking');
    expect(x?.getAttribute('data-tooltip')).toBe('Done asking (Esc)');
    expect(textarea(container).placeholder).toBe('Ask about this reply');
  });

  it('the field is described by which reply it asks about', () => {
    const props = { ...composerProps(), mode: ASK, askLine: 'Asking about the reply: Hi there' };
    const { container } = render(InputRow, { props });
    const ids = textarea(container).getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toContain('sp-ask-line');
    expect(document.getElementById('sp-ask-line')?.textContent).toBe(
      'Asking about the reply: Hi there',
    );
  });

  it('Done asking calls the mode cancel', async () => {
    const props = { ...composerProps(), mode: ASK };
    const { container } = render(InputRow, { props });
    await fireEvent.click(container.querySelector('[aria-label="Done asking"]') as HTMLElement);
    expect(props.onCancelMode).toHaveBeenCalledTimes(1);
  });

  it('a pasted image is refused: a question is words only', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const props = { ...composerProps(), mode: ASK };
    const { container } = render(InputRow, { props });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    const item = { type: 'image/png', kind: 'file', getAsFile: () => file };
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { items: [item], files: [file], getData: () => '' },
      configurable: true,
    });
    textarea(container).dispatchEvent(event);
    await vi.waitFor(() =>
      expect(push.mock.calls.map((c) => c[0].message)).toContain(
        "Images can't be part of a question.",
      ),
    );
    expect(props.onAttachImage).not.toHaveBeenCalled();
  });

  it('says what it is told, again for the same words, and where it goes back to on leaving', async () => {
    const text = 'Now asking about the new answer';
    const props = { ...composerProps(), mode: ASK, announce: { text } };
    const { container, rerender } = render(InputRow, { props });
    await waitFor(() => expect(said(container)).toBe(text));
    // Cleared, then set: the live region changes, so a screen reader hears the repeat.
    const seen: string[] = [];
    const region = container.querySelector('[data-ega-mode-said]') as HTMLElement;
    const watch = new MutationObserver(() => seen.push(region.textContent));
    watch.observe(region, { childList: true, characterData: true, subtree: true });
    await rerender({ ...props, announce: { text } });
    await waitFor(() => expect(seen.at(-1)).toBe(text));
    expect(seen).toContain('');
    watch.disconnect();
    await rerender({ ...props, announce: null, mode: { kind: 'send' } });
    await waitFor(() => expect(said(container)).toBe('Back to Translate to English'));
  });
});

describe('the picker Ask chip', () => {
  it('reads "Ask" with no arrow; its name says the answer language', () => {
    const props = { ...composerProps(), task: 'ask' as never };
    const { container } = render(InputRow, { props });
    const chip = container.querySelector('[data-ega-mode-chip]');
    expect(chip?.querySelector('[data-ega-user-name]')?.textContent).toBe('Ask');
    expect(chip?.getAttribute('aria-label')).toBe(
      'Ask, answers in English, change task and language',
    );
  });
});
