// @vitest-environment jsdom
// A row whose stored conversation this build cannot read stays in the list with its reason (spec §7, §11.2).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { threadKey } from '@/shared/saved-conversations';
import type { Turn } from '@/sidepanel/state/conversation';

const tabsQuery = chrome.tabs.query as unknown as Mock;
const sendMessage = chrome.runtime.sendMessage as Mock;

const user = (id: string, content: string): Turn =>
  ({ id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content }) as Turn;

const turnIds = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-turn-id]')).map(
    (t) => t.dataset['turnId'] ?? '',
  );

const V2 = 'https://v2.example';

beforeEach(async () => {
  await chrome.storage.local.clear();
  sendMessage.mockResolvedValue({ ok: true });
  tabsQuery.mockResolvedValue([{ id: 1, url: 'https://a.test/page' }]);
  await saveThread('https://a.test', [user('a1', 'hola')]);
  await saveThread(V2, [user('v1', 'future chat')]);
  const key = threadKey(V2);
  const stored = (await chrome.storage.local.get(key))[key] as Record<string, unknown>;
  await chrome.storage.local.set({ [key]: { ...stored, version: 99 } });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel — a conversation this build cannot read', () => {
  it('stays in the open list with "Can\'t open this conversation." and the panel keeps its thread', async () => {
    const { container } = render(SidePanel);
    await waitFor(() => expect(turnIds(container)).toEqual(['a1']));
    await fireEvent.click(
      container.querySelector<HTMLElement>('[data-ega-header-site]') as HTMLElement,
    );
    const row = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(`[data-ega-conv-row="${CSS.escape(V2)}"]`);
    const open = await waitFor(() => {
      const b = row()?.querySelector<HTMLElement>('[data-ega-conv-open]');
      if (!b) throw new Error('row not shown');
      return b;
    });

    await fireEvent.click(open);

    await waitFor(() => expect(row()?.textContent).toContain("Can't open this conversation."));
    expect(document.querySelector('[data-ega-conversations]')).not.toBeNull();
    expect(turnIds(container)).toEqual(['a1']);
  });
});
