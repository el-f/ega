// @vitest-environment jsdom
// D-b: the header names the site; New conversation is one click, keeps the old one, and Undo reopens it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { readIndex } from '@/shared/saved-conversations';
import { toastStore } from '@/shared/components/toastStore';
import { chromeMock } from '@tests/mocks/chrome';

beforeEach(async () => {
  await chrome.storage.local.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  (chromeMock.tabs.query as Mock).mockResolvedValue([{ id: 1, url: 'https://example.com/a' }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  (chromeMock.tabs.query as Mock).mockResolvedValue([]);
  document.body.innerHTML = '';
});

const turnIds = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll<HTMLElement>('[data-turn-id]')).map(
    (t) => t.dataset['turnId'] ?? '',
  );

describe('SidePanel header — conversations', () => {
  it('names the site, and hides New and Search on an empty thread', async () => {
    const { container } = render(SidePanel);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-header-site]')?.textContent).toContain(
        'example.com',
      ),
    );
    expect(container.querySelector('[data-ega-header-site]')?.getAttribute('aria-label')).toBe(
      'example.com, conversations',
    );
    expect(container.querySelector('[data-ega-new-conversation]')).toBeNull();
    expect(container.querySelector('[data-ega-search-toggle]')).toBeNull();
  });

  it('New keeps the old conversation, shows an Undo toast, and Undo opens it again', async () => {
    await saveThread('https://example.com', [
      { id: 'old', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'hola' },
    ]);
    const push = vi.spyOn(toastStore, 'push');
    const { container } = render(SidePanel);
    const newBtn = await waitFor(() => {
      const b = container.querySelector<HTMLElement>('[data-ega-new-conversation]');
      if (!b) throw new Error('New not shown yet');
      return b;
    });
    expect(turnIds(container)).toEqual(['old']);

    await fireEvent.click(newBtn);
    await waitFor(() => expect(turnIds(container)).toEqual([]));
    await waitFor(() => expect(document.activeElement?.id).toBe('sp-text'));
    const toast = push.mock.calls
      .map((c) => c[0])
      .find((m) => m.message === 'Started a new conversation');
    expect(toast?.action?.label).toBe('Undo');
    expect((await readIndex()).threads.map((t) => t.origin)).toEqual(['https://example.com']);

    toast?.action?.onClick();
    await waitFor(() => expect(turnIds(container)).toEqual(['old']));
  });
});
