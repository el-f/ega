// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { toastStore } from '@/shared/components/toastStore';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import { composerProps } from './_composer';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

beforeEach(() => {
  vi.restoreAllMocks();
  // The Add menu depends on the speech API; most cases here want the plain paperclip.
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
});
afterEach(() => vi.unstubAllGlobals());

function textarea(c: HTMLElement): HTMLTextAreaElement {
  const ta = c.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!ta) throw new Error('textarea not found');
  return ta;
}
const send = (c: HTMLElement): HTMLButtonElement =>
  c.querySelector<HTMLButtonElement>('[data-ega-send]') as HTMLButtonElement;

describe('composer keys', () => {
  it('Enter sends; Shift+Enter and an IME composition do not', async () => {
    const props = { ...composerProps(), value: 'hola' };
    const { container } = render(InputRow, { props });
    await fireEvent.keyDown(textarea(container), { key: 'Enter', shiftKey: true });
    await fireEvent.keyDown(textarea(container), { key: 'Enter', isComposing: true });
    expect(props.onSend).not.toHaveBeenCalled();
    await fireEvent.keyDown(textarea(container), { key: 'Enter' });
    expect(props.onSend).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(textarea(container), { key: 'Enter', ctrlKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(2);
  });

  it('Enter while a reply runs sends nothing and says what to do', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const props = { ...composerProps(), value: 'hola', inflight: true };
    const { container } = render(InputRow, { props });
    await fireEvent.keyDown(textarea(container), { key: 'Enter' });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({
      message: 'Wait for this reply, or press Stop.',
      variant: 'warning',
    });
  });

  it('Esc stops a running reply, and only then', async () => {
    const props = composerProps();
    const { container, rerender } = render(InputRow, { props });
    await fireEvent.keyDown(textarea(container), { key: 'Escape' });
    expect(props.onCancel).not.toHaveBeenCalled();
    await rerender({ ...props, inflight: true });
    await fireEvent.keyDown(textarea(container), { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Send and Stop', () => {
  it('an empty composer has a Send that stays focusable and says why it is not ready', async () => {
    const props = composerProps();
    const { container } = render(InputRow, { props });
    const btn = send(container);
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Send');
    const why = container.querySelector(`#${btn.getAttribute('aria-describedby') ?? 'x'}`);
    expect(why?.textContent).toBe('Type a message first');
    await fireEvent.click(btn);
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('an attached image alone is enough to send', async () => {
    const props = { ...composerProps(), attachedImage: PIXEL };
    const { container } = render(InputRow, { props });
    expect(send(container).getAttribute('aria-disabled')).toBeNull();
    await fireEvent.click(send(container));
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('becomes Stop in the same place while a reply runs', async () => {
    const props = { ...composerProps(), inflight: true };
    const { container } = render(InputRow, { props });
    expect(send(container).getAttribute('aria-label')).toBe('Stop');
    expect(send(container).getAttribute('data-tooltip')).toBe('Stop (Esc)');
    await fireEvent.click(send(container));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('the length cap', () => {
  it('shows nothing for ordinary text', () => {
    const { container } = render(InputRow, { props: { ...composerProps(), value: 'short' } });
    expect(container.querySelector('#sp-count')).toBeNull();
  });

  it('counts near the cap', () => {
    const value = 'a'.repeat(Math.floor(MAX_SELECTION_CHARS * 0.9));
    const { container } = render(InputRow, { props: { ...composerProps(), value } });
    expect(container.querySelector('#sp-count')?.textContent.trim()).toBe(
      `${value.length.toLocaleString('en-US')} / ${MAX_SELECTION_CHARS.toLocaleString('en-US')}`,
    );
  });

  it('over the cap, the count is Send’s visible reason and nothing sends', async () => {
    const value = 'a'.repeat(MAX_SELECTION_CHARS + 12);
    const props = { ...composerProps(), value };
    const { container } = render(InputRow, { props });
    expect(container.querySelector('#sp-count')?.textContent).toContain('· 12 too many');
    expect(send(container).getAttribute('aria-describedby')).toBe('sp-count');
    await fireEvent.keyDown(textarea(container), { key: 'Enter' });
    expect(props.onSend).not.toHaveBeenCalled();
  });
});

describe('row A: the mode chip and what goes with the next send', () => {
  it('names the task and the target, with "to" in the accessible name', () => {
    const { container } = render(InputRow, { props: composerProps() });
    const chip = container.querySelector('[data-ega-mode-chip]');
    expect(chip?.textContent.trim()).toBe('Translate → English');
    expect(chip?.getAttribute('aria-label')).toBe('Translate to English, change task and language');
  });

  it('names the source when it is not Auto-detect, and the image route', () => {
    const { container } = render(InputRow, {
      props: { ...composerProps(), sourceLang: 'es', attachedImage: null },
    });
    expect(container.querySelector('[data-ega-mode-chip]')?.textContent.trim()).toBe(
      'Translate · Spanish → English',
    );
    document.body.innerHTML = '';
    const img = render(InputRow, {
      props: { ...composerProps(), task: 'summarize' as never, attachedImage: PIXEL },
    });
    expect(img.container.querySelector('[data-ega-mode-chip]')?.textContent.trim()).toBe(
      'Translate image → English',
    );
  });

  it('lists page info, earlier messages and the image, and removes the image', async () => {
    const props = {
      ...composerProps(),
      pageInfoGoes: true,
      turns: [
        { role: 'user' as const, content: 'hola', status: 'idle' as const },
        { role: 'assistant' as const, content: 'hello', status: 'done' as const },
      ],
    };
    const { container, rerender } = render(InputRow, { props });
    expect(container.querySelector('[data-ega-next-send]')?.textContent).toMatch(
      /Page info\s*2 earlier messages/,
    );
    await rerender({ ...props, attachedImage: PIXEL });
    const info = container.querySelector('[data-ega-next-send]')?.textContent ?? '';
    // An image send carries no history, so the count goes away.
    expect(info).not.toContain('earlier');
    expect(info).toContain('Image');
    await fireEvent.click(container.querySelector('[data-ega-chip-remove]') as HTMLElement);
    expect(props.onClearAttachedImage).toHaveBeenCalledTimes(1);
  });

  it('the chip opens the Next message popover with Task and Language', async () => {
    const { container } = render(InputRow, { props: composerProps() });
    await fireEvent.click(container.querySelector('[data-ega-mode-chip]') as HTMLElement);
    const pop = await waitFor(() => {
      const p = document.querySelector('[data-ega-mode-popover]');
      if (!p) throw new Error('popover not open');
      return p;
    });
    expect(pop.textContent).toContain('Task');
    expect(pop.textContent).toContain('Language');
    expect(document.querySelector('#sp-conv-source')).not.toBeNull();
    expect(document.querySelector('#sp-conv-target')).not.toBeNull();
    // Auto-detect with no reply to swap from: the swap is not rendered at all.
    expect(document.querySelector('[data-ega-swap]')).toBeNull();
  });
});

describe('edit and refine modes', () => {
  it('a banner replaces the chip, and its x leaves the mode', async () => {
    const props = { ...composerProps(), mode: { kind: 'edit' as const, turnId: 'u1' } };
    const { container, rerender } = render(InputRow, { props });
    expect(container.querySelector('[data-ega-mode-chip]')).toBeNull();
    expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain(
      'Editing your message',
    );
    await fireEvent.click(container.querySelector('[aria-label="Cancel editing"]') as HTMLElement);
    expect(props.onCancelMode).toHaveBeenCalledTimes(1);
    await rerender({ ...props, mode: { kind: 'refine', turnId: 'a1' } });
    expect(container.querySelector('[data-ega-mode-banner]')?.textContent).toContain(
      'Changing this reply',
    );
    expect(textarea(container).placeholder).toBe('Describe the change');
  });

  it('the placeholder says what the box takes', () => {
    const { container } = render(InputRow, { props: composerProps() });
    expect(textarea(container).placeholder).toBe('Type, paste, or drop an image');
    document.body.innerHTML = '';
    const img = render(InputRow, { props: { ...composerProps(), attachedImage: PIXEL } });
    expect(textarea(img.container).placeholder).toBe('Add a note (optional)');
  });
});

describe('attaching an image', () => {
  it('with no speech API, Add is the paperclip itself and opens the file picker', async () => {
    const { container } = render(InputRow, { props: composerProps() });
    const add = container.querySelector<HTMLElement>('[data-ega-add]');
    expect(add?.getAttribute('aria-label')).toBe('Attach image');
    const input = container.querySelector<HTMLInputElement>('[data-ega-image-input]');
    if (!add || !input) throw new Error('elements not found');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    await fireEvent.click(add);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('a pasted image is attached', async () => {
    const props = composerProps();
    const { container } = render(InputRow, { props });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    const item = { type: 'image/png', kind: 'file', getAsFile: () => file };
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { items: [item], files: [file], getData: () => '' },
      configurable: true,
    });
    textarea(container).dispatchEvent(event);
    await vi.waitFor(() => expect(props.onAttachImage).toHaveBeenCalledTimes(1));
    expect(String(props.onAttachImage.mock.calls[0]?.[0])).toMatch(/^data:image\//);
  });

  it('a dropped image is attached, and the dragged-over box is marked', async () => {
    const props = composerProps();
    const { container } = render(InputRow, { props });
    const box = container.querySelector('.ega-input-box') as HTMLElement;
    await fireEvent.dragOver(textarea(container), { dataTransfer: { dropEffect: 'none' } });
    expect(box.classList.contains('drag-active')).toBe(true);
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    await fireEvent.drop(textarea(container), {
      dataTransfer: { files: [file], getData: () => '' } as unknown as DataTransfer,
    });
    await vi.waitFor(() => expect(props.onAttachImage).toHaveBeenCalledTimes(1));
    expect(box.classList.contains('drag-active')).toBe(false);
  });

  it.each([
    [
      'a format the model cannot read',
      new File(['BM'], 's.bmp', { type: 'image/bmp' }),
      /Only PNG, JPEG, WebP and GIF/,
    ],
    [
      'an image over the 4 MB limit',
      new File([new Uint8Array(4.2 * 1024 * 1024)], 'big.png', { type: 'image/png' }),
      /over 4 MB/,
    ],
  ])('picking %s attaches nothing and says why', async (_label, file, message) => {
    const props = composerProps();
    const push = vi.spyOn(toastStore, 'push');
    const { container } = render(InputRow, { props });
    const input = container.querySelector<HTMLInputElement>('[data-ega-image-input]');
    if (!input) throw new Error('image input not found');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(push.mock.calls[0]?.[0]).toMatchObject({ message: expect.stringMatching(message) });
    expect(props.onAttachImage).not.toHaveBeenCalled();
  });
});
