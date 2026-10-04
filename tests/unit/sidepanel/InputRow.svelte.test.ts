// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { tick } from 'svelte';
import { toastStore } from '@/shared/components/toastStore';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('InputRow.svelte', () => {
  it('Cmd+Enter fires onSend when textarea has content', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props: { ...props, value: 'hello' } });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    await fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Enter also fires onSend (cross-platform)', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props: { ...props, value: 'hi' } });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    await fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('Esc fires onCancel only when inflight', async () => {
    const off = baseProps();
    const { container, rerender } = render(InputRow, {
      props: { ...off, inflight: false },
    });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    await fireEvent.keyDown(ta, { key: 'Escape' });
    expect(off.onCancel).not.toHaveBeenCalled();

    const on = baseProps();
    await rerender({ ...on, inflight: true });
    const ta2 = container.querySelector('textarea');
    if (!ta2) throw new Error('textarea not found (post-rerender)');
    await fireEvent.keyDown(ta2, { key: 'Escape' });
    expect(on.onCancel).toHaveBeenCalledTimes(1);
  });

  it('paste of an image clipboard item fires onAttachImage with a data URL', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    // Build a fake DataTransfer with a single image item.
    const blob = await fetch(PIXEL)
      .then((r) => r.blob())
      .catch(() => new Blob(['x'], { type: 'image/png' }));
    const file = new File([blob], 'pixel.png', { type: 'image/png' });
    const item = {
      type: 'image/png',
      kind: 'file',
      getAsFile: () => file,
    };
    const itemsArr = [item];
    const items = {
      length: 1,
      0: item,
      [Symbol.iterator]: function* () {
        for (const it of itemsArr) yield it;
      },
    } as unknown as DataTransferItemList;
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { items, files: [file], getData: () => '' },
      configurable: true,
    });
    ta.dispatchEvent(event);
    // onAttachImage fires asynchronously inside FileReader.onload —
    // wait a microtask to settle.
    await vi.waitFor(() => expect(props.onAttachImage).toHaveBeenCalled());
    expect(props.onAttachImage).toHaveBeenCalledTimes(1);
    const arg = props.onAttachImage.mock.calls[0]?.[0] ?? '';
    expect(typeof arg).toBe('string');
    expect((arg as string).startsWith('data:image/')).toBe(true);
  });

  it.each([
    [
      'a format the model cannot read',
      new File(['BM'], 'scan.bmp', { type: 'image/bmp' }),
      /Only PNG, JPEG, WebP and GIF/,
    ],
    [
      'an image over the 4 MB limit',
      new File([new Uint8Array(4.2 * 1024 * 1024)], 'big.png', { type: 'image/png' }),
      /over 4 MB/,
    ],
  ])('picking %s attaches nothing and says why', async (_label, file, message) => {
    const props = baseProps();
    const push = vi.spyOn(toastStore, 'push');
    const { container } = render(InputRow, { props });
    const input = container.querySelector<HTMLInputElement>('[data-ega-image-input]');
    if (!input) throw new Error('image input not found');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(push.mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringMatching(message),
      variant: 'warning',
    });
    expect(props.onAttachImage).not.toHaveBeenCalled();
  });

  it('drop of an image file fires onAttachImage with a data URL', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    const blob = await fetch(PIXEL)
      .then((r) => r.blob())
      .catch(() => new Blob(['x'], { type: 'image/png' }));
    const file = new File([blob], 'pixel.png', { type: 'image/png' });
    // jsdom doesn't ship DataTransfer — synthesize the minimal shape
    // InputRow's drop handler reads (`.files`).
    const fakeDt = { files: [file], getData: () => '' } as unknown as DataTransfer;
    await fireEvent.drop(ta, { dataTransfer: fakeDt });
    await vi.waitFor(() => expect(props.onAttachImage).toHaveBeenCalled());
    expect(props.onAttachImage).toHaveBeenCalled();
    const arg = props.onAttachImage.mock.calls[0]?.[0] ?? '';
    expect((arg as string).startsWith('data:image/')).toBe(true);
  });

  it('Send button is disabled with no text and no image', () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const send = container.querySelector('.ega-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('Send button enables once attachedImage is set', async () => {
    const props = baseProps();
    const { container } = render(InputRow, {
      props: { ...props, attachedImage: PIXEL },
    });
    const send = container.querySelector('.ega-send') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('Stop button replaces Send while inflight + clicking it fires onCancel', async () => {
    const props = baseProps();
    const { container } = render(InputRow, {
      props: { ...props, inflight: true },
    });
    const stop = container.querySelector('.ega-send.danger');
    expect(stop).not.toBeNull();
    if (stop) await fireEvent.click(stop);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('Stop button aria-label matches its visible "Stop" text (WCAG 2.5.3)', () => {
    const props = baseProps();
    const { container } = render(InputRow, {
      props: { ...props, inflight: true },
    });
    const stop = container.querySelector('.ega-send.danger') as HTMLButtonElement | null;
    expect(stop).not.toBeNull();
    expect(stop?.getAttribute('aria-label')).toBe('Stop');
    expect(stop?.textContent).toContain('Stop');
  });

  it('Stop button exposes the Esc-to-cancel shortcut via tooltip', () => {
    const props = baseProps();
    const { container } = render(InputRow, {
      props: { ...props, inflight: true },
    });
    const stop = container.querySelector('.ega-send.danger') as HTMLButtonElement | null;
    expect(stop?.getAttribute('data-tooltip')).toBe('Stop · Esc');
    // top-end: the send row sits at the right viewport edge, where a centered tooltip collapses.
    expect(stop?.getAttribute('data-tooltip-placement')).toBe('top-end');
  });

  it('swap control renders a Lucide icon, not a raw "↔" glyph', () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const swap = container.querySelector('.ega-lang-pair .swap') as HTMLButtonElement | null;
    expect(swap).not.toBeNull();
    expect(swap?.textContent).not.toContain('↔');
    expect(swap?.querySelector('svg')).not.toBeNull();
  });

  describe('platform-aware placeholder', () => {
    const setPlatform = (platform: string): void => {
      Object.defineProperty(navigator, 'userAgentData', {
        value: { platform },
        configurable: true,
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'userAgentData');
    });

    it('uses Ctrl+Enter on Windows/Linux', () => {
      setPlatform('Windows');
      const props = baseProps();
      const { container } = render(InputRow, { props });
      const ta = container.querySelector('textarea');
      expect(ta?.getAttribute('placeholder')).toContain('Ctrl+Enter');
      expect(ta?.getAttribute('placeholder')).not.toContain('Cmd+Enter');
    });

    it('uses Cmd+Enter on macOS', () => {
      setPlatform('macOS');
      const props = baseProps();
      const { container } = render(InputRow, { props });
      const ta = container.querySelector('textarea');
      expect(ta?.getAttribute('placeholder')).toContain('Cmd+Enter');
    });

    it('image-attached placeholder is also platform-aware', () => {
      setPlatform('Windows');
      const props = baseProps();
      const { container } = render(InputRow, {
        props: { ...props, attachedImage: PIXEL },
      });
      const ta = container.querySelector('textarea');
      expect(ta?.getAttribute('placeholder')).toContain('Ctrl+Enter to translate the image');
    });
  });

  describe('image file-picker', () => {
    it('[data-ega-attach-image] button is present', () => {
      const props = baseProps();
      const { container } = render(InputRow, { props });
      expect(container.querySelector('[data-ega-attach-image]')).not.toBeNull();
    });

    it('[data-ega-image-input] hidden file input is present with correct attributes', () => {
      const props = baseProps();
      const { container } = render(InputRow, { props });
      const input = container.querySelector('[data-ega-image-input]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.type).toBe('file');
      expect(input?.accept).toBe('image/*');
    });

    it('clicking [data-ega-attach-image] calls .click() on the hidden input', async () => {
      const props = baseProps();
      const { container } = render(InputRow, { props });
      const btn = container.querySelector('[data-ega-attach-image]');
      const input = container.querySelector('[data-ega-image-input]') as HTMLInputElement | null;
      if (!btn || !input) throw new Error('elements not found');
      const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
      await fireEvent.click(btn);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('InputRow — a mixed clipboard pastes the text the user selected', () => {
  async function pasteWith(text: string): Promise<ReturnType<typeof baseProps>> {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    const blob = await fetch(PIXEL)
      .then((r) => r.blob())
      .catch(() => new Blob(['x'], { type: 'image/png' }));
    const file = new File([blob], 'pixel.png', { type: 'image/png' });
    const item = { type: 'image/png', kind: 'file', getAsFile: () => file };
    const itemsArr = [item];
    const items = {
      length: 1,
      0: item,
      [Symbol.iterator]: function* () {
        for (const it of itemsArr) yield it;
      },
    } as unknown as DataTransferItemList;
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { items, files: [file], getData: () => text },
      configurable: true,
    });
    ta.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 0));
    return props;
  }

  it('keeps the text and skips the screenshot the spreadsheet also put on the clipboard', async () => {
    const props = await pasteWith('A\tB\nC\tD');
    expect(props.onAttachImage).not.toHaveBeenCalled();
  });

  it('still attaches when the clipboard holds only whitespace beside the image', async () => {
    const props = await pasteWith('   ');
    await vi.waitFor(() => expect(props.onAttachImage).toHaveBeenCalled());
  });
});

describe('InputRow — nothing is dropped in silence', () => {
  it('Ctrl+Enter while a reply streams says why nothing was sent', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const props = baseProps();
    const { container } = render(InputRow, {
      props: { ...props, value: 'hi', inflight: true },
    });
    const ta = container.querySelector('textarea');
    if (!ta) throw new Error('textarea not found');
    await fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Stop/);
  });

  it('a non-image file names why it was not attached', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const row = container.querySelector('.ega-input-row');
    if (!row) throw new Error('row not found');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const fakeDt = { files: [file], getData: () => '' } as unknown as DataTransfer;
    await fireEvent.drop(row, { dataTransfer: fakeDt });
    expect(props.onAttachImage).not.toHaveBeenCalled();
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/Only images/);
  });

  it('the text half of a mixed drop is called out, not discarded quietly', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const row = container.querySelector('.ega-input-row');
    if (!row) throw new Error('row not found');
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    const fakeDt = { files: [file], getData: () => 'some text' } as unknown as DataTransfer;
    await fireEvent.drop(row, { dataTransfer: fakeDt });
    expect(push.mock.calls[0]?.[0]?.message).toMatch(/dropped text was ignored/);
  });

  it('dropped text lands after trimmed whitespace, with the caret at the end', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props: { ...props, value: 'foo \n' } });
    const row = container.querySelector('.ega-input-row');
    const ta = container.querySelector('textarea');
    if (!row || !ta) throw new Error('row or textarea not found');
    const fakeDt = { files: [], getData: () => 'bar' } as unknown as DataTransfer;
    await fireEvent.drop(row, { dataTransfer: fakeDt });
    await tick();
    expect(ta.value).toBe('foo\nbar');
    expect(document.activeElement).toBe(ta);
    expect(ta.selectionStart).toBe(ta.value.length);
  });

  it('a drop anywhere in the composer counts, not only on the textarea', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const strip = container.querySelector('.ega-task-chips');
    if (!strip) throw new Error('task chips not found');
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    const fakeDt = { files: [file], getData: () => '' } as unknown as DataTransfer;
    await fireEvent.drop(strip, { dataTransfer: fakeDt });
    await vi.waitFor(() => expect(props.onAttachImage).toHaveBeenCalled());
  });

  it('dragging over the row tints the row', async () => {
    const props = baseProps();
    const { container } = render(InputRow, { props });
    const row = container.querySelector('.ega-input-row');
    if (!row) throw new Error('row not found');
    await fireEvent.dragOver(row);
    expect(row.classList.contains('drag-active')).toBe(true);
  });
});

describe('InputRow — earlier-messages note in the options popover', () => {
  const turns = [
    { role: 'user' as const, status: 'idle', content: 'hola' },
    { role: 'assistant' as const, status: 'done', content: 'hello' },
  ];

  async function openOptions(container: HTMLElement): Promise<void> {
    const btn = container.querySelector('[data-ega-composer-options]');
    if (!btn) throw new Error('options button not found');
    await fireEvent.click(btn);
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  }

  it('counts the earlier messages after a completed exchange', async () => {
    const { container } = render(InputRow, { props: { ...baseProps(), turns } });
    await openOptions(container);
    expect(document.querySelector('.ega-context-label')?.textContent).toMatch(
      /Using 2 earlier messages/,
    );
  });

  it('says nothing while an image is attached, since an image send drops history', async () => {
    const { container } = render(InputRow, {
      props: { ...baseProps(), turns, attachedImage: PIXEL },
    });
    await openOptions(container);
    expect(document.querySelector('.ega-context-label')).toBeNull();
  });
});
