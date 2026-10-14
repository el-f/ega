// @vitest-environment jsdom
import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { GENERAL_ORIGIN, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { drainAsync } from '@tests/_helpers/async';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

function storedTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

describe("another window's write reaches the open side panel", () => {
  it('shows the turn the other window saved without a reload', async () => {
    await saveThread(GENERAL_ORIGIN, [storedTurn('u1', 'first')], { writer: 'other-window' });
    const { container } = render(SidePanel);
    await drainAsync();
    expect(container.querySelectorAll('[data-turn-id]').length).toBe(1);

    await saveThread(GENERAL_ORIGIN, [storedTurn('u1', 'first'), storedTurn('u2', 'second')], {
      knownIds: new Set(['u1', 'u2']),
      writer: 'other-window',
    });
    await drainAsync();

    expect([...container.querySelectorAll('[data-turn-id]')].map((el) => el.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('second')]),
    );
    expect(container.querySelectorAll('[data-turn-id]').length).toBe(2);
  });
});
