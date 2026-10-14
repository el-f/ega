// Every other propagation test hand-fires onChanged; these drive a real write, so a producer that stops writing the key fails red.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { chromeMock } from '../mocks/chrome';
import { onSettingsChanged, updateSettings } from '@/shared/storage';
import { openOptionsTab, consumePendingOptionsTab } from '@/shared/open-options-tab';
import { setLogLevel } from '@/shared/logger';

type Changes = Record<string, chrome.storage.StorageChange>;

function recordChanges(): { calls: [Changes, string][]; stop: () => void } {
  const calls: [Changes, string][] = [];
  const fn = (c: Changes, area: string): void => void calls.push([c, area]);
  chromeMock.storage.onChanged.addListener(fn);
  return { calls, stop: () => chromeMock.storage.onChanged.removeListener(fn) };
}

describe('chrome mock storage change events', () => {
  it('fires on set with newValue only for a key that did not exist', async () => {
    const rec = recordChanges();
    await chromeMock.storage.local.set({ k: 1 });
    rec.stop();
    expect(rec.calls).toEqual([[{ k: { newValue: 1 } }, 'local']]);
  });

  it('fires on set with both oldValue and newValue for an overwrite', async () => {
    await chromeMock.storage.local.set({ k: 1 });
    const rec = recordChanges();
    await chromeMock.storage.local.set({ k: 2 });
    rec.stop();
    expect(rec.calls).toEqual([[{ k: { oldValue: 1, newValue: 2 } }, 'local']]);
  });

  it('fires on remove with oldValue only, and stays silent for an absent key', async () => {
    await chromeMock.storage.local.set({ k: 1 });
    const rec = recordChanges();
    await chromeMock.storage.local.remove('k');
    await chromeMock.storage.local.remove('never-existed');
    rec.stop();
    expect(rec.calls).toEqual([[{ k: { oldValue: 1 } }, 'local']]);
  });

  it('fires on clear with every held key', async () => {
    await chromeMock.storage.local.set({ a: 1, b: 2 });
    const rec = recordChanges();
    await chromeMock.storage.local.clear();
    rec.stop();
    expect(rec.calls).toEqual([[{ a: { oldValue: 1 }, b: { oldValue: 2 } }, 'local']]);
  });

  it('reports the area the write landed in', async () => {
    const rec = recordChanges();
    await chromeMock.storage.session.set({ k: 1 });
    await chromeMock.storage.sync.set({ k: 1 });
    rec.stop();
    expect(rec.calls.map(([, area]) => area)).toEqual(['session', 'sync']);
  });

  it('supports the callback overload on get and remove', async () => {
    await chromeMock.storage.local.set({ k: 'v' });
    const got = await new Promise<Record<string, unknown>>((resolve) => {
      void chromeMock.storage.local.get('k', resolve);
    });
    expect(got).toEqual({ k: 'v' });
    await new Promise<void>((resolve) => {
      void chromeMock.storage.local.remove('k', resolve);
    });
    expect(chromeMock.storage.local._raw.has('k')).toBe(false);
  });

  it('stays silent for a direct _raw seed, so fixtures do not look like writes', async () => {
    const rec = recordChanges();
    chromeMock.storage.local._raw.set('k', 1);
    await Promise.resolve();
    rec.stop();
    expect(rec.calls).toEqual([]);
  });
});

describe('settings propagation, driven by the real writer', () => {
  let unsub: (() => void) | null = null;
  afterEach(() => {
    unsub?.();
    unsub = null;
  });

  it('delivers the settings a real updateSettings() wrote to onSettingsChanged', async () => {
    const seen: string[] = [];
    unsub = onSettingsChanged((s) => seen.push(s.theme));
    await updateSettings({ theme: 'dark' });
    await vi.waitFor(() => expect(seen).toEqual(['dark']));
  });

  it('stops delivering after unsubscribe', async () => {
    const seen: string[] = [];
    const off = onSettingsChanged((s) => seen.push(s.theme));
    await updateSettings({ theme: 'dark' });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    off();
    await updateSettings({ theme: 'light' });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['dark']);
  });
});

describe('consumePendingOptionsTab', () => {
  afterEach(() => {
    setLogLevel('warn');
    vi.restoreAllMocks();
  });

  it('returns the tab openOptionsTab parked and clears the slot', async () => {
    openOptionsTab('backends');
    await vi.waitFor(() =>
      expect(chromeMock.storage.local._raw.get('ega.pendingOptionsTab')).toBe('backends'),
    );

    expect(await consumePendingOptionsTab()).toBe('backends');
    expect(chromeMock.storage.local._raw.has('ega.pendingOptionsTab')).toBe(false);
    expect(await consumePendingOptionsTab()).toBeNull();
  });

  it('leaves a non-string slot in place and reports null', async () => {
    await chromeMock.storage.local.set({ 'ega.pendingOptionsTab': 42 });
    expect(await consumePendingOptionsTab()).toBeNull();
    expect(chromeMock.storage.local._raw.get('ega.pendingOptionsTab')).toBe(42);
  });

  it('breadcrumbs a failed slot write and still opens the page', async () => {
    setLogLevel('debug');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(chromeMock.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );

    openOptionsTab('backends');

    await vi.waitFor(() =>
      expect(debug.mock.calls.some((c) => String(c[0]).includes('ega:catch:openOptionsTab'))).toBe(
        true,
      ),
    );
    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalled();
  });
});
