// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const userTurn = (over: Partial<Turn> = {}): Turn => ({
  createdAt: Date.now(),
  id: 'u1',
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content: 'hola',
  ...over,
});

const assistantTurn = (over: Partial<Turn> = {}): Turn => ({
  createdAt: Date.now(),
  id: 'a1',
  role: 'assistant',
  kind: 'translate',
  status: 'done',
  content: 'hello',
  attachedToTurnId: 'u1',
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('a turn tells a screen reader what it is', () => {
  it('names the speaker, the task and the time on a user turn', () => {
    const { container } = render(UserTurn, { props: { turn: userTurn() } });
    const label = container.querySelector('article')?.getAttribute('aria-label') ?? '';
    expect(label.startsWith('You · Translate · ')).toBe(true);
  });

  it('names the speaker on a reply, and counts its variants', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: assistantTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('article')?.getAttribute('aria-label')).toBe('Ega reply');

    const withVariants = assistantTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'a' },
        { id: 'v2', status: 'done', content: 'b' },
      ] as NonNullable<Turn['variants']>,
      activeVariantIdx: 1,
    });
    const second = render(AssistantTurn, { props: { turn: withVariants, onRetry: vi.fn() } });
    expect(second.container.querySelector('article')?.getAttribute('aria-label')).toBe(
      'Ega reply · 2 of 2 variants',
    );
  });
});

describe('one tab stop per turn, arrows move inside it', () => {
  it('gives a user turn a single tabbable action', () => {
    const { container } = render(UserTurn, { props: { turn: userTurn() } });
    const toolbar = container.querySelector('[role="toolbar"]');
    const tabbable = toolbar?.querySelectorAll('button[tabindex="0"]') ?? [];
    expect(tabbable.length).toBe(1);
    expect(tabbable[0]?.getAttribute('data-ega-action')).toBe('copy');
  });

  it('moves the tab stop with ArrowRight and wraps at the end', async () => {
    const { container } = render(UserTurn, { props: { turn: userTurn() } });
    const toolbar = container.querySelector('[role="toolbar"]');
    if (!toolbar) throw new Error('toolbar not found');
    await fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    await tick();
    expect(toolbar.querySelector('button[tabindex="0"]')?.getAttribute('data-ega-action')).toBe(
      'bookmark',
    );
    await fireEvent.keyDown(toolbar, { key: 'End' });
    await tick();
    expect(toolbar.querySelector('button[tabindex="0"]')?.getAttribute('data-ega-action')).toBe(
      'delete',
    );
    await fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    await tick();
    expect(toolbar.querySelector('button[tabindex="0"]')?.getAttribute('data-ega-action')).toBe(
      'copy',
    );
  });

  it('drops the edit stop on an image turn instead of leaving a dead key', async () => {
    const { container } = render(UserTurn, {
      props: { turn: userTurn({ imageDataUrl: 'data:image/png;base64,AAA' }) },
    });
    const toolbar = container.querySelector('[role="toolbar"]');
    if (!toolbar) throw new Error('toolbar not found');
    await fireEvent.keyDown(toolbar, { key: 'End' });
    await tick();
    expect(toolbar.querySelector('[data-ega-action="edit"]')).toBeNull();
    expect(toolbar.querySelector('button[tabindex="0"]')?.getAttribute('data-ega-action')).toBe(
      'delete',
    );
  });

  it('gives a reply the same single stop', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: assistantTurn(), onRetry: vi.fn() },
    });
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.querySelectorAll('button[tabindex="0"]').length).toBe(1);
  });
});

describe('the tab stop never parks on a disabled button', () => {
  it('drops retry and regenerate from the cycle while another reply streams', async () => {
    const { container, rerender } = render(AssistantTurn, {
      props: { turn: assistantTurn(), onRetry: vi.fn(), onRegenerate: vi.fn(), inflight: false },
    });
    const toolbar = container.querySelector('[role="toolbar"]');
    if (!toolbar) throw new Error('toolbar not found');
    await fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    await tick();
    expect(toolbar.querySelector('button[tabindex="0"]')?.getAttribute('data-ega-action')).toBe(
      'regenerate',
    );

    await rerender({
      turn: assistantTurn(),
      onRetry: vi.fn(),
      onRegenerate: vi.fn(),
      inflight: true,
    });
    await tick();
    const stop = container.querySelector('[role="toolbar"] button[tabindex="0"]');
    expect(stop).not.toBeNull();
    expect((stop as HTMLButtonElement).disabled).toBe(false);
  });

  it('arrows from the button the user clicked, not from the last arrowed one', async () => {
    const { container } = render(UserTurn, { props: { turn: userTurn() } });
    const toolbar = container.querySelector('[role="toolbar"]');
    if (!toolbar) throw new Error('toolbar not found');
    const bookmark = toolbar.querySelector<HTMLButtonElement>('[data-ega-action="bookmark"]');
    if (!bookmark) throw new Error('bookmark not found');
    await fireEvent.focusIn(bookmark);
    await tick();
    await fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    await tick();
    expect(toolbar.querySelector('button[tabindex="0"]')?.getAttribute('data-ega-action')).toBe(
      'edit',
    );
  });
});

describe('the panel names its own keys', () => {
  const overlay = readFileSync('src/shared/components/ShortcutOverlay.svelte', 'utf8');

  it('lists the side panel keys for the side panel, not the popup ones', () => {
    expect(overlay).toMatch(/isSidePanel/);
    expect(overlay).toMatch(/Move between messages/);
    expect(overlay).toMatch(/Jump to the message box/);
    expect(overlay).toMatch(/Retry the focused reply/);
    expect(overlay).toMatch(/Send to the side panel \(in the popup\)/);
    expect(overlay).not.toMatch(/Translate \(in popup textarea\)/);
  });
});
