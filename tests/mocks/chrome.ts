import { vi } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

type Listener<T extends unknown[]> = (...args: T) => void;

function makeEvent<T extends unknown[]>() {
  const ls = new Set<Listener<T>>();
  return {
    addListener: (fn: Listener<T>) => ls.add(fn),
    removeListener: (fn: Listener<T>) => ls.delete(fn),
    hasListener: (fn: Listener<T>) => ls.has(fn),
    emit: (...args: T) => ls.forEach((fn) => fn(...args)),
  };
}

type StorageChanges = Record<string, chrome.storage.StorageChange>;

const storageOnChanged = makeEvent<[StorageChanges, string]>();

function makeArea(areaName: 'local' | 'session' | 'sync') {
  const data = new Map<string, unknown>();
  const onChanged = makeEvent<[StorageChanges]>();
  // Chrome delivers the event before the write settles, so `await set()` guarantees listeners ran.
  const fire = (changes: StorageChanges): void => {
    if (Object.keys(changes).length === 0) return;
    storageOnChanged.emit(changes, areaName);
    onChanged.emit(changes);
  };
  const readKeys = (keys?: string | string[] | Record<string, unknown> | null) =>
    keys == null
      ? Object.fromEntries(data)
      : (Array.isArray(keys) ? keys : [keys as string]).reduce<Record<string, unknown>>(
          (acc, k) => ((acc[k] = data.get(k)), acc),
          {},
        );
  return {
    get: (
      keys?: string | string[] | Record<string, unknown> | null,
      cb?: (items: Record<string, unknown>) => void,
    ) => {
      const out = readKeys(keys);
      if (cb) {
        cb(out);
        return Promise.resolve(out);
      }
      return Promise.resolve(out);
    },
    set: (items: Record<string, unknown>, cb?: () => void) => {
      const changes: StorageChanges = {};
      for (const [k, v] of Object.entries(items)) {
        // Chrome omits oldValue for a key that did not exist, and tests read that difference.
        const had = data.has(k);
        const oldValue = data.get(k);
        data.set(k, v);
        changes[k] = had ? { oldValue, newValue: v } : { newValue: v };
      }
      fire(changes);
      cb?.();
      return Promise.resolve();
    },
    remove: (keys: string | string[], cb?: () => void) => {
      const changes: StorageChanges = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (!data.has(k)) continue;
        changes[k] = { oldValue: data.get(k) };
        data.delete(k);
      }
      fire(changes);
      cb?.();
      return Promise.resolve();
    },
    clear: (cb?: () => void) => {
      const changes: StorageChanges = {};
      for (const [k, v] of data) changes[k] = { oldValue: v };
      data.clear();
      fire(changes);
      cb?.();
      return Promise.resolve();
    },
    onChanged,
    /** Emits a change without a write, on both the global and this area's event, as Chrome does. */
    _fire: fire,
    _raw: data,
  };
}

/** Surfaces route settings writes through the SW, so the mock must apply the patch like the SW does. */
async function applySettingsUpdate(msg: unknown): Promise<{ ok: true } | null> {
  const m = msg as { kind?: string; patch?: Record<string, unknown> } | null;
  if (m?.kind !== 'settings:update' || typeof m.patch !== 'object') return null;
  const key = 'ega.settings';
  const cur = ((await chromeMock.storage.local.get(key))[key] ?? {}) as Record<string, unknown>;
  await chromeMock.storage.local.set({ [key]: { ...cur, ...m.patch } });
  return { ok: true };
}

export const chromeMock = {
  runtime: {
    id: 'ega-test',
    lastError: undefined as chrome.runtime.LastError | undefined,
    getURL: (p: string) => `chrome-extension://ega-test/${p}`,
    getManifest: () => ({ version: pkg.version, version_name: pkg.version }),
    sendMessage: vi.fn(async (msg: unknown) => (await applySettingsUpdate(msg)) ?? { ok: true }),
    onMessage: makeEvent<[unknown, chrome.runtime.MessageSender, (r: unknown) => void]>(),
    connect: vi.fn(),
    // Real connectNative always returns a Port; a missing host shows up later via onDisconnect.
    connectNative: vi.fn(() => {
      const onDisconnect = makeEvent<[chrome.runtime.Port]>();
      const onMessage = makeEvent<[unknown]>();
      const port = {
        name: 'ega-native-stub',
        onDisconnect,
        onMessage,
        postMessage: vi.fn(),
        disconnect: vi.fn(() => onDisconnect.emit(port as unknown as chrome.runtime.Port)),
      } as unknown as chrome.runtime.Port;
      // Disconnect on the next tick, the way a missing host does.
      queueMicrotask(() => onDisconnect.emit(port));
      return port;
    }),
    openOptionsPage: vi.fn(),
    onInstalled: makeEvent<[chrome.runtime.InstalledDetails]>(),
    onSuspend: makeEvent<[]>(),
  },
  storage: {
    local: makeArea('local'),
    session: makeArea('session'),
    sync: makeArea('sync'),
    onChanged: storageOnChanged,
  },
  contextMenus: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn((cb?: () => void) => {
      cb?.();
      return Promise.resolve();
    }),
    onClicked: makeEvent<[chrome.contextMenus.OnClickData, chrome.tabs.Tab | undefined]>(),
  },
  commands: {
    onCommand: makeEvent<[string]>(),
    getAll: vi.fn().mockResolvedValue([]),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: 1, url: '' }),
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    onActivated: makeEvent<[chrome.tabs.OnActivatedInfo]>(),
    onUpdated: makeEvent<[number, chrome.tabs.OnUpdatedInfo, chrome.tabs.Tab]>(),
    onRemoved: makeEvent<[number, chrome.tabs.OnRemovedInfo]>(),
  },
  windows: {
    getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
    getAll: vi.fn().mockResolvedValue([{ id: 1 }]),
  },
  action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
  permissions: {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(true),
  },
  sidePanel: {
    open: vi.fn().mockResolvedValue(undefined),
    setPanelBehavior: vi.fn().mockResolvedValue(undefined),
  },
};

export function resetChromeMock(): void {
  chromeMock.storage.local._raw.clear();
  chromeMock.storage.session._raw.clear();
  chromeMock.storage.sync._raw.clear();
  chromeMock.runtime.lastError = undefined;
  vi.clearAllMocks();
}
