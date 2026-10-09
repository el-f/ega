// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import SavedConversations from '@/options/components/SavedConversations.svelte';
import ShortcutInput from '@/shared/components/ShortcutInput.svelte';
import { backendLabel } from '@/shared/backends/provider-profiles';
import { toastStore } from '@/shared/components/toastStore';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { flushPendingDeletes, scheduleConversationDelete } from '@/shared/saved-conversations';
import type * as SavedConversationsModule from '@/shared/saved-conversations';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('@/shared/saved-conversations', async (original) => ({
  ...(await original<typeof SavedConversationsModule>()),
  scheduleConversationDelete: vi.fn(() => ({ undo: vi.fn(), commit: vi.fn() })),
  flushPendingDeletes: vi.fn(),
}));

async function seedLegacy(): Promise<void> {
  await chrome.storage.local.set({
    'ega:conv:index': {
      version: 1,
      threads: [{ origin: 'https://legacy.test', updatedAt: 1, bytes: 500 }],
    },
    'ega:conv:t:https://legacy.test': {
      version: 1,
      turns: [{ id: 'u1', role: 'user', content: 'A legacy first message', createdAt: 1 }],
    },
  });
}

describe('options handoff completion', () => {
  beforeEach(() => {
    vi.mocked(scheduleConversationDelete).mockClear();
    vi.mocked(flushPendingDeletes).mockClear();
    vi.mocked(confirmDialog).mockClear();
  });

  it('backfills an older conversation title and message count from its stored turns', async () => {
    await seedLegacy();
    const { container } = render(SavedConversations);
    await waitFor(() =>
      expect(container.querySelector('[data-ega-conv-title]')?.textContent).toBe(
        'A legacy first message',
      ),
    );
    expect(container.querySelector('.conv-meta')?.textContent).toContain('1 message');
  });

  it('deletes immediately with Undo and keeps a pending delete hidden after refresh', async () => {
    await seedLegacy();
    const pushed = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(container.querySelector('[data-ega-conv-delete]')).not.toBeNull());
    await fireEvent.click(getByRole('button', { name: /Delete conversation/ }));
    await waitFor(() =>
      expect(scheduleConversationDelete).toHaveBeenCalledWith(
        ['https://legacy.test'],
        expect.any(Object),
      ),
    );
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(container.querySelector('[data-ega-conv-delete]')).toBeNull();
    expect(pushed.mock.calls.at(-1)?.[0].action?.label).toBe('Undo');
    await seedLegacy();
    expect(container.querySelector('[data-ega-conv-delete]')).toBeNull();
    pushed.mock.calls.at(-1)?.[0].action?.onClick();
    await waitFor(() => expect(container.querySelector('[data-ega-conv-delete]')).not.toBeNull());
    expect(vi.mocked(scheduleConversationDelete).mock.results[0]?.value.undo).toHaveBeenCalled();
  });

  it('flushes waiting deletes when the component leaves and when the page closes', async () => {
    const { unmount } = render(SavedConversations);
    await fireEvent(window, new Event('pagehide'));
    expect(flushPendingDeletes).toHaveBeenCalledOnce();
    unmount();
    expect(flushPendingDeletes).toHaveBeenCalledTimes(2);
  });

  it('shows a newly saved conversation under an old id after its delete completes', async () => {
    await seedLegacy();
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container, getByRole } = render(SavedConversations);
    await waitFor(() => expect(container.querySelector('[data-ega-conv-delete]')).not.toBeNull());
    await fireEvent.click(getByRole('button', { name: /Delete conversation/ }));
    const options = vi.mocked(scheduleConversationDelete).mock.calls.at(-1)?.[1] as
      { onDone?: () => void } | undefined;
    options?.onDone?.();
    await seedLegacy();
    await waitFor(() => expect(container.querySelector('[data-ega-conv-delete]')).not.toBeNull());
  });

  it('names the record action Cancel recording while recording and describes the current shortcut', async () => {
    const { getByRole } = render(ShortcutInput, {
      props: { value: 'Ctrl+Shift+L', ariaLabel: 'Record translation shortcut', onchange: vi.fn() },
    });
    const button = getByRole('button', { name: 'Record translation shortcut' });
    const description = button
      .getAttribute('aria-describedby')
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');
    expect(description).toContain('Ctrl+Shift+L');
    await fireEvent.click(button);
    expect(getByRole('button', { name: 'Cancel recording' })).toBe(button);
  });

  it('names the native backend Claude Code or Codex', () => {
    expect(backendLabel('native')).toBe('Claude Code or Codex');
  });
});
