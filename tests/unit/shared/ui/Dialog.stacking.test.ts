// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Dialog from '@/shared/ui/Dialog.svelte';
import { textSnippet } from './_helpers';

// jsdom paints nothing, so this pins the layer each dialog asks CSS for; the e2e design-rules flow checks the paint.
function layer(el: Element | null): number {
  if (!(el instanceof HTMLElement)) throw new Error('missing element');
  return Number(el.style.getPropertyValue('--ega-dialog-layer') || '0');
}

function openDialog(title: string) {
  return render(Dialog, {
    props: { open: true, title, onClose: () => {}, children: textSnippet(title) },
  });
}

describe('Dialog — a dialog opened over another dialog', () => {
  it('puts its backdrop above the dialog under it, so the lower one is covered', async () => {
    const lower = openDialog('Summarize task');
    await tick();
    const upper = openDialog('Close without this change?');
    await tick();

    const lowerPanel = lower.container.querySelector('.ega-dialog');
    const upperBackdrop = upper.container.querySelector('.ega-dialog-backdrop');
    const upperPanel = upper.container.querySelector('.ega-dialog');
    expect(layer(upperBackdrop)).toBeGreaterThan(layer(lowerPanel));
    expect(layer(upperBackdrop)).toBe(layer(upperPanel));

    upper.unmount();
    lower.unmount();
  });

  it('starts from the bottom layer again once every dialog has closed', async () => {
    const first = openDialog('Summarize task');
    await tick();
    const base = layer(first.container.querySelector('.ega-dialog'));
    first.unmount();

    const next = openDialog('Translate task');
    await tick();
    expect(layer(next.container.querySelector('.ega-dialog'))).toBe(base);
    next.unmount();
  });

  it('opens a third dialog above the second even after the first closed under it', async () => {
    const first = openDialog('Task');
    await tick();
    const second = openDialog('Template version diff');
    await tick();
    first.unmount();
    const third = openDialog('Close without this change?');
    await tick();

    expect(layer(third.container.querySelector('.ega-dialog-backdrop'))).toBeGreaterThan(
      layer(second.container.querySelector('.ega-dialog')),
    );
    third.unmount();
    second.unmount();
  });
});
