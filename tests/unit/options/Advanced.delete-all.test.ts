// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { updateSettings } from '@/shared/storage';
import { withConversationLock } from '@/shared/conversation-lock';
import { OPTIONS_LOCAL_UI_KEYS } from '@/options/local-ui-keys';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';
import { flushAsync } from '@tests/_helpers/async';
import type { Settings } from '@/shared/types';

const download = vi.fn();
vi.mock('@/shared/download-file', () => ({
  downloadJsonFile: (...a: unknown[]) => download(...a),
}));

const { default: Advanced } = await import('@/options/tabs/Advanced.svelte');

function mount(s: Settings = parseSettings({})) {
  return render(Advanced, { props: { s, onSetSettings: vi.fn() } });
}

const field = (): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>('[data-ega-delete-all-field]');
const confirmBtn = (): HTMLButtonElement =>
  document.querySelector('[data-ega-delete-all-confirm]') as HTMLButtonElement;

async function openDialog(view: ReturnType<typeof mount>): Promise<HTMLInputElement> {
  await fireEvent.click(view.getByRole('button', { name: 'Delete all data' }));
  return waitFor(() => {
    const f = field();
    if (!f) throw new Error('dialog not open');
    return f;
  });
}

/** Opens the dialog, types DELETE and confirms. */
async function deleteAll(view: ReturnType<typeof mount>): Promise<void> {
  const f = await openDialog(view);
  await fireEvent.input(f, { target: { value: 'DELETE' } });
  await fireEvent.click(confirmBtn());
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

let pushed: ToastMsg[] = [];
beforeEach(() => {
  resetChromeMock();
  download.mockReset();
  sessionStorage.clear();
  pushed = [];
  vi.spyOn(toastStore, 'push').mockImplementation((m) => {
    pushed.push(m);
  });
});

describe('Advanced — Delete all data dialog', () => {
  it('names what is lost, says it cannot be undone, and starts in the field', async () => {
    const view = mount();
    const f = await openDialog(view);
    const dialog = document.querySelector('[data-ega-delete-all-dialog]') as HTMLElement;
    for (const noun of [
      /Settings and API keys/,
      /languages, tasks, glossary and rules/,
      /conversations/,
      /request list and saved answers/,
    ]) {
      expect(dialog.textContent).toMatch(noun);
    }
    expect(dialog.querySelector('strong')?.textContent).toBe('This cannot be undone.');
    expect(document.activeElement).toBe(f);
    expect(document.querySelector('label[for="' + f.id + '"]')?.textContent).toBe(
      'Type DELETE to confirm',
    );
  });

  it('the red button does nothing until DELETE is typed, and says why', async () => {
    const view = mount();
    const f = await openDialog(view);
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(confirmBtn().getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Type DELETE to confirm');
    await fireEvent.click(confirmBtn());
    await fireEvent.input(f, { target: { value: 'delete' } });
    await fireEvent.click(confirmBtn());
    await flushAsync();
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith({
      kind: 'translate:cancel-all',
    });
    await fireEvent.input(f, { target: { value: 'DELETE' } });
    expect(confirmBtn().getAttribute('aria-disabled')).toBeNull();
  });

  it('Keep my data closes it and deletes nothing', async () => {
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ theme: 'dark' }));
    const view = mount();
    await openDialog(view);
    await fireEvent.click(view.getByRole('button', { name: 'Keep my data' }));
    await waitFor(() => expect(field()).toBeNull());
    expect(chromeMock.storage.local._raw.get('ega.settings')).toBeDefined();
  });

  it('Export all settings first downloads a keyless backup and keeps the dialog open', async () => {
    const view = mount();
    await openDialog(view);
    await fireEvent.click(view.getByRole('button', { name: 'Export all settings first' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const bundle = download.mock.calls[0]?.[1] as { settings: Record<string, unknown> };
    expect(bundle.settings['anthropicApiKey'] ?? '').toBe('');
    await waitFor(() =>
      expect(document.querySelector('[data-ega-delete-all-dialog]')?.textContent).toContain(
        'Exported to a file',
      ),
    );
    expect(field()).not.toBeNull();
  });
});

describe('Advanced — Delete all data', () => {
  it('also drops the options UI state kept outside chrome.storage', async () => {
    for (const key of OPTIONS_LOCAL_UI_KEYS) localStorage.setItem(key, '1');
    await deleteAll(mount());
    await vi.waitFor(() => {
      for (const key of OPTIONS_LOCAL_UI_KEYS) expect(localStorage.getItem(key)).toBeNull();
    });
  });

  it('tells the worker to clear the audit log, so a request still running cannot write it back', async () => {
    await deleteAll(mount());
    await vi.waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'audit:clear' }),
    );
  });

  it('a settings write that already read the old row cannot put the API key back', async () => {
    chromeMock.storage.local._raw.set(
      'ega.settings',
      parseSettings({ anthropicApiKey: 'sk-ant-live' }),
    );
    const view = mount();
    const f = await openDialog(view);
    await fireEvent.input(f, { target: { value: 'DELETE' } });

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
      await fireEvent.click(confirmBtn());
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
    await deleteAll(mount());
    await purgeDone();

    expect(storedAtCancel).toEqual({ version: 1 });
    expect(chromeMock.storage.local._raw.get('ega:conv:t:https://a.test')).toBeUndefined();
  });

  it('waits for a side-panel thread save already in progress', async () => {
    const view = mount();
    const f = await openDialog(view);
    await fireEvent.input(f, { target: { value: 'DELETE' } });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    // A thread save holds the lock: it has read the index and is about to write the thread.
    const save = withConversationLock(async () => {
      await gate;
      await chrome.storage.local.set({ 'ega:conv:t:https://a.test': { version: 1 } });
    });
    await fireEvent.click(confirmBtn());
    await purgeStarted();
    release();
    await save;
    await purgeDone();

    expect(chromeMock.storage.local._raw.get('ega:conv:t:https://a.test')).toBeUndefined();
  });

  it('a failed delete says what to do next, and Try again opens the dialog again', async () => {
    vi.spyOn(chrome.storage.local, 'clear').mockRejectedValueOnce(new Error('quota'));
    await deleteAll(mount());
    await vi.waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]).toMatchObject({
      variant: 'danger',
      message: expect.stringMatching(/quota.*Delete all data again/),
    });
    expect(field()).toBeNull();
    expect(pushed[0]?.action?.label).toBe('Try again');
    pushed[0]?.action?.onClick();
    await waitFor(() => expect(field()).not.toBeNull());
  });
});

describe('Advanced — Clear cache', () => {
  it('acts at once and confirms with a toast', async () => {
    const view = mount();
    await fireEvent.click(view.getByRole('button', { name: 'Clear cache' }));
    await vi.waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'cache:clear' }),
    );
    await vi.waitFor(() =>
      expect(pushed).toContainEqual(
        expect.objectContaining({ message: 'Saved answers cleared', variant: 'success' }),
      ),
    );
  });

  it('a failed clear says so, with Try again', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValueOnce(new Error('worker gone'));
    const view = mount();
    await fireEvent.click(view.getByRole('button', { name: 'Clear cache' }));
    await vi.waitFor(() =>
      expect(pushed).toContainEqual(
        expect.objectContaining({
          variant: 'danger',
          message: 'Saved answers were not cleared',
        }),
      ),
    );
    expect(pushed.at(-1)?.action?.label).toBe('Try again');
  });
});

// X14: an error toast with Try again stays until it is closed, so the next attempt of the same action closes it first.
describe('Advanced — a new attempt closes the stale error', () => {
  it('Clear cache again closes "Saved answers were not cleared" before it runs', async () => {
    const close = vi.spyOn(toastStore, 'close').mockImplementation(() => {});
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValueOnce(new Error('worker gone'));
    const view = mount();
    await fireEvent.click(view.getByRole('button', { name: 'Clear cache' }));
    await vi.waitFor(() =>
      expect(pushed).toContainEqual(
        expect.objectContaining({ message: 'Saved answers were not cleared' }),
      ),
    );
    close.mockClear();
    await fireEvent.click(view.getByRole('button', { name: 'Clear cache' }));
    await vi.waitFor(() =>
      expect(pushed).toContainEqual(expect.objectContaining({ message: 'Saved answers cleared' })),
    );
    expect(close).toHaveBeenCalledWith('Saved answers were not cleared');
  });

  it('Delete all data again closes the failure toast of the last attempt', async () => {
    const close = vi.spyOn(toastStore, 'close').mockImplementation(() => {});
    vi.spyOn(chrome.storage.local, 'clear').mockRejectedValueOnce(new Error('quota'));
    const view = mount();
    await deleteAll(view);
    await vi.waitFor(() => expect(pushed).toHaveLength(1));
    const key = pushed[0]?.key;
    expect(key).toBeDefined();
    close.mockClear();
    await deleteAll(view);
    await purgeDone();
    expect(close).toHaveBeenCalledWith(key);
  });
});
