// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { updateSettings } from '@/shared/storage';
import { withConversationLock } from '@/shared/conversation-lock';
import { flushAsync } from '@tests/_helpers/async';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn(async () => true) }));

const { default: About } = await import('@/options/tabs/About.svelte');

async function purgeButton(container: HTMLElement): Promise<HTMLButtonElement> {
  return waitFor(() => {
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      /delete all data/i.test(b.textContent),
    );
    if (!btn) throw new Error('purge button not found');
    return btn;
  });
}

/** The purge has sent its first message and gone on to wait for the storage locks. */
async function purgeStarted(): Promise<void> {
  await vi.waitFor(() =>
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'translate:cancel-all' }),
  );
  await flushAsync();
}

/** The cache clear is the purge's last step. */
async function purgeDone(): Promise<void> {
  await vi.waitFor(() =>
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'cache:clear' }),
  );
}

describe('About — Delete all data', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('tells the worker to clear the audit log, so a request still running cannot write it back', async () => {
    const { container } = render(About);
    await fireEvent.click(await purgeButton(container));
    await vi.waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'audit:clear' }),
    );
  });

  it('a settings write that already read the old row cannot put the API key back', async () => {
    chromeMock.storage.local._raw.set(
      'ega.settings',
      parseSettings({ anthropicApiKey: 'sk-ant-live' }),
    );
    const { container } = render(About);
    const btn = await purgeButton(container);

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const get = chromeMock.storage.local.get;
    let held = false;
    chromeMock.storage.local.get = async (k?: Parameters<typeof get>[0]) => {
      const out = await get(k);
      if (!held && k === 'ega.settings') {
        held = true;
        await gate;
      }
      return out;
    };

    try {
      const write = updateSettings({ theme: 'dark' });
      await new Promise((r) => setTimeout(r, 0));
      await fireEvent.click(btn);
      await purgeStarted();
      release();
      await write;
      await purgeDone();
    } finally {
      chromeMock.storage.local.get = get;
    }

    expect(chromeMock.storage.local._raw.get('ega.settings')).toBeUndefined();
  });

  it('stops running requests before it wipes storage, so a late reply has nothing to land in', async () => {
    chromeMock.storage.local._raw.set('ega:conv:t:https://a.test', { version: 1 });
    let storedAtCancel: unknown = 'not-sent';
    chromeMock.runtime.sendMessage.mockImplementation(async (m: unknown) => {
      if ((m as { kind?: string }).kind === 'translate:cancel-all') {
        storedAtCancel = chromeMock.storage.local._raw.get('ega:conv:t:https://a.test');
      }
      return { ok: true };
    });
    const { container } = render(About);
    await fireEvent.click(await purgeButton(container));
    await purgeDone();

    expect(storedAtCancel).toEqual({ version: 1 });
    expect(chromeMock.storage.local._raw.get('ega:conv:t:https://a.test')).toBeUndefined();
  });

  it('waits for a side-panel thread save already in progress', async () => {
    const { container } = render(About);
    const btn = await purgeButton(container);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    // A thread save holds the lock: it has read the index and is about to write the thread.
    const save = withConversationLock(async () => {
      await gate;
      await chrome.storage.local.set({ 'ega:conv:t:https://a.test': { version: 1 } });
    });
    await fireEvent.click(btn);
    await purgeStarted();
    release();
    await save;
    await purgeDone();

    expect(chromeMock.storage.local._raw.get('ega:conv:t:https://a.test')).toBeUndefined();
  });
});
