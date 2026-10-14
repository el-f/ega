// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { resetChromeMock } from '../../mocks/chrome';

const id = 'https://saved.test#chosen';
const key = 'ega.pendingConversationOpen:1';

beforeEach(async () => {
  resetChromeMock();
  await saveThread(id, [
    {
      id: 'saved-user',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      createdAt: 1,
      content: 'The saved conversation chosen in Settings',
    },
  ]);
});

describe('opening a saved conversation from Settings', () => {
  it('lands a queued choice after the initial tab follow and consumes it once', async () => {
    await chrome.storage.session.set({ [key]: { id, ts: Date.now() } });
    const { container } = render(SidePanel);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-header-site]')?.textContent).toContain(
        'saved.test',
      ),
    );
    expect(container.textContent).toContain('The saved conversation chosen in Settings');
    expect((await chrome.storage.session.get(key))[key]).toBeUndefined();
  });

  it('opens a choice in an already mounted panel while leaving another window alone', async () => {
    const { container } = render(SidePanel);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-sidepanel-empty]')).not.toBeNull(),
    );
    await chrome.storage.session.set({ 'ega.pendingConversationOpen:2': { id, ts: Date.now() } });
    expect(container.querySelector('[data-ega-header-site]')?.textContent).not.toContain(
      'saved.test',
    );
    await chrome.storage.session.set({ [key]: { id, ts: Date.now() } });
    await waitFor(() =>
      expect(container.querySelector('[data-ega-header-site]')?.textContent).toContain(
        'saved.test',
      ),
    );
    expect(
      (await chrome.storage.session.get('ega.pendingConversationOpen:2'))[
        'ega.pendingConversationOpen:2'
      ],
    ).toBeDefined();
  });
});
