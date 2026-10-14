// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Dialog from '@/shared/ui/Dialog.svelte';
import { textSnippet } from './_helpers';

function open(): HTMLElement {
  const { getByRole } = render(Dialog, {
    props: {
      open: true,
      onClose: vi.fn(),
      title: 'Edit task',
      help: textSnippet('HELP'),
      actions: textSnippet('ACTIONS'),
      children: textSnippet('BODY'),
    },
  });
  return getByRole('dialog');
}

/** jsdom has no layout: give the body the box sizes a real scroll container would report. */
function size(body: HTMLElement, box: { scrollHeight: number; clientHeight: number }): void {
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: box.scrollHeight });
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: box.clientHeight });
}

describe('Dialog body scroll', () => {
  it('scrolls only the body; the title, help line and buttons sit outside it', () => {
    const dialog = open();
    const body = dialog.querySelector<HTMLElement>('.ega-dialog-body');
    expect(body?.textContent).toContain('BODY');
    expect(body?.textContent).not.toContain('Edit task');
    expect(body?.textContent).not.toContain('HELP');
    expect(body?.contains(dialog.querySelector('.ega-dialog-actions'))).toBe(false);
  });

  it('shows no fade when everything fits', async () => {
    const dialog = open();
    const body = dialog.querySelector<HTMLElement>('.ega-dialog-body') as HTMLElement;
    size(body, { scrollHeight: 300, clientHeight: 300 });
    await fireEvent.scroll(body);
    expect(dialog.querySelector('.ega-dialog-cue')).toBeNull();
  });

  it('fades the bottom edge while more content sits below, and the top edge once scrolled', async () => {
    const dialog = open();
    const body = dialog.querySelector<HTMLElement>('.ega-dialog-body') as HTMLElement;
    size(body, { scrollHeight: 900, clientHeight: 300 });
    await fireEvent.scroll(body);
    expect(dialog.querySelector('.ega-dialog-cue.cue-bottom')).not.toBeNull();
    expect(dialog.querySelector('.ega-dialog-cue.cue-top')).toBeNull();

    body.scrollTop = 300;
    await fireEvent.scroll(body);
    expect(dialog.querySelector('.ega-dialog-cue.cue-top')).not.toBeNull();
    expect(dialog.querySelector('.ega-dialog-cue.cue-bottom')).not.toBeNull();

    body.scrollTop = 600;
    await fireEvent.scroll(body);
    expect(dialog.querySelector('.ega-dialog-cue.cue-top')).not.toBeNull();
    expect(dialog.querySelector('.ega-dialog-cue.cue-bottom')).toBeNull();
  });
});
