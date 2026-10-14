// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import type { Msg } from '@/shared/messages';
import { drainAsync } from '@tests/_helpers/async';
import { openMenu } from './_reply';

const sendMessage = chrome.runtime.sendMessage as Mock;

function startCalls(): Array<Record<string, unknown>> {
  return (sendMessage.mock.calls as Array<[unknown]>)
    .map(([m]) => m as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
}

async function sendAndDrain(container: HTMLElement, text: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('#sp-text');
  if (!textarea) throw new Error('sp-text textarea not found');
  await fireEvent.input(textarea, { target: { value: text } });
  await tick();
  const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
  if (!sendBtn) throw new Error('send button not found');
  await fireEvent.click(sendBtn);
  await tick();
  const requestId = startCalls().at(-1)?.['requestId'] as string | undefined;
  if (!requestId) throw new Error('no translate:start requestId found');
  (chrome.runtime.onMessage as unknown as { emit: (...args: unknown[]) => void }).emit(
    { kind: 'translate:chunk', chunk: { type: 'done', requestId, confidence: 0.9 } } satisfies Msg,
    { id: chrome.runtime.id },
    () => {},
  );
  await tick();
  await tick();
}

/** onMount reads settings asynchronously; a send before it lands goes nowhere. */
async function settleMount(container: HTMLElement): Promise<void> {
  await waitFor(() => {
    if (!container.querySelector('[data-ega-backend-chip]')) throw new Error('mount not settled');
  });
}

const inMenu = (): boolean => document.activeElement?.closest('[role="menu"]') != null;

/** Opens the reply's More menu and waits for bits-ui to move focus onto the first item. */
async function openMenuFocused(container: HTMLElement): Promise<HTMLElement> {
  await openMenu(container, 'more');
  await waitFor(() => {
    if (!inMenu()) throw new Error('focus not in the menu');
  });
  return document.activeElement as HTMLElement;
}

const focusedRing = (container: HTMLElement): Element | null => container.querySelector('.focused');

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — keys typed inside a reply menu stay in the menu', () => {
  it('ArrowDown, e and c in the reply More menu do not walk the thread, edit or jump to the composer', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    await waitFor(() => {
      if (!container.querySelector('[data-ega-reply] [data-ega-action="more"]'))
        throw new Error('reply not rendered');
    });

    const first = await openMenuFocused(container);

    await fireEvent.keyDown(first, { key: 'ArrowDown' });
    await tick();
    expect(focusedRing(container)).toBeNull();
    // bits-ui moved the highlight to the next item; the panel did not pull focus onto a turn.
    expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(first);

    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'e' });
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'c' });
    await tick();
    expect(container.querySelector('[data-ega-mode-banner]')).toBeNull();
    expect(document.activeElement?.id).not.toBe('sp-text');
  });

  // Only the stream's role=menu guard stops these: bits-ui never preventDefaults a type-ahead letter.
  it('j and k typed in the reply More menu do not walk the thread', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    const first = await openMenuFocused(container);

    await fireEvent.keyDown(first, { key: 'j' });
    await tick();
    expect(focusedRing(container)).toBeNull();
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'k' });
    await tick();
    expect(focusedRing(container)).toBeNull();
    expect(inMenu()).toBe(true);
  });

  it('r typed in the menu does not re-run the focused reply', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    await openMenuFocused(container);
    const before = startCalls().length;
    // Keys go where focus is, as for a real user: two leaked arrows walk the ring to the reply, then 'r' retries it.
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'r' });
    // Red only with BOTH stream guards (defaultPrevented, role=menu) reverted; either alone stops the arrows.
    await drainAsync();

    expect(startCalls().length).toBe(before);
    expect(focusedRing(container)).toBeNull();
  });

  it('j and c typed on a Refine item do not walk the thread or jump to the composer', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    await openMenu(container, 'refine');
    const chip = document.querySelector<HTMLElement>('[data-ega-refine-preset="shorter"]');
    if (!chip) throw new Error('preset missing');
    chip.focus();

    await fireEvent.keyDown(chip, { key: 'j' });
    await tick();
    expect(focusedRing(container)).toBeNull();
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'c' });
    await tick();
    expect(document.activeElement).toBe(chip);
  });

  it('ArrowDown on the More trigger opens the menu without walking the thread', async () => {
    const { container } = render(SidePanel);
    await settleMount(container);
    await sendAndDrain(container, 'hola');
    const trigger = container.querySelector<HTMLElement>(
      '[data-ega-reply] [data-ega-action="more"]',
    );
    if (!trigger) throw new Error('More trigger missing');
    trigger.focus();
    await tick();
    // Focus inside the reply puts the ring on it (R2-F3); the key must not move it on.
    const ring = focusedRing(container);
    expect(ring?.contains(trigger)).toBe(true);

    await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await tick();

    expect(focusedRing(container)).toBe(ring);
    await waitFor(() => {
      if (!document.querySelector('[data-ega-answer-again]')) throw new Error('menu not open');
    });
    // A walk would have pulled focus onto the reply's article instead of into the menu.
    await waitFor(() => expect(inMenu()).toBe(true));
  });
});
