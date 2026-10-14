// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { GENERAL_ORIGIN, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { drainAsync } from '@tests/_helpers/async';

// A real clear() drives this, not a hand-fired onChanged: whether clear() reports the removed keys is the premise.

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function storedTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

describe('a full storage wipe reaches the open side panel', () => {
  it('drops the loaded thread and does not write it back', async () => {
    await saveThread(GENERAL_ORIGIN, [storedTurn('u1', 'kept text')]);
    const { container } = render(SidePanel);
    await drainAsync();
    expect(container.querySelectorAll('[data-turn-id]').length).toBe(1);

    await chrome.storage.local.clear();
    await drainAsync();

    expect(container.querySelectorAll('[data-turn-id]').length).toBe(0);
    expect(Object.keys(await chrome.storage.local.get(null))).toEqual([]);
  });
});
