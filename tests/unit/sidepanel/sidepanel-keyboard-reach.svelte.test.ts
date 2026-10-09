// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readFileSync } from 'node:fs';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';

const assistantTurn = (over: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
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

// Names, single tab stops and arrows live in AssistantTurn.reply and UserTurn tests; this one is the click-then-arrow case.
describe('the tab stop follows a click', () => {
  it('arrows from the button the user clicked, not from the last arrowed one', async () => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: assistantTurn(),
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        onRegenerate: vi.fn(),
        isLatest: true,
      },
    });
    const regenerate = container.querySelector<HTMLElement>('[data-ega-action="regenerate"]');
    regenerate?.focus();
    await fireEvent.click(regenerate as HTMLElement);
    await fireEvent.keyDown(regenerate as HTMLElement, { key: 'ArrowRight' });
    await tick();
    expect(document.activeElement?.getAttribute('data-ega-action')).toBe('refine');
  });
});

describe('the panel names its own keys', () => {
  const overlay = readFileSync('src/shared/components/ShortcutOverlay.svelte', 'utf8');

  it('lists the side panel keys for the side panel, not the popup ones', () => {
    expect(overlay).toMatch(/isSidePanel/);
    expect(overlay).toMatch(/Move between messages/);
    expect(overlay).toMatch(/Jump to the message box/);
    expect(overlay).toMatch(/Regenerate the focused reply/);
    expect(overlay).toMatch(/Send to the side panel \(in the popup\)/);
    expect(overlay).not.toMatch(/Translate \(in popup textarea\)/);
  });
});
