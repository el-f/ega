// @vitest-environment jsdom
// Copy as Markdown that the clipboard refuses says what to do next, in the panel's one wording (spec §11.6).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { toastStore } from '@/shared/components/toastStore';
import type { Turn } from '@/sidepanel/state/conversation';
import { pickHeaderMenuItem } from './_header-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  (chrome.tabs.query as unknown as Mock).mockResolvedValue([{ id: 1, url: 'https://a.test/x' }]);
  await saveThread('https://a.test', [
    { id: 'u1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hola' },
    {
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      createdAt: 2,
      content: 'hello',
      attachedToTurnId: 'u1',
    },
  ] as Turn[]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SidePanel — Copy as Markdown', () => {
  it('a refused clipboard write says "Couldn\'t copy. Try again."', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const push = vi.spyOn(toastStore, 'push');
    const { container } = render(SidePanel);
    await waitFor(() => expect(container.querySelectorAll('[data-turn-id]')).toHaveLength(2));

    await pickHeaderMenuItem(container, '[data-ega-export-markdown]');

    await waitFor(() =>
      expect(push.mock.calls.map((c) => c[0].message)).toContain("Couldn't copy. Try again."),
    );
  });
});
