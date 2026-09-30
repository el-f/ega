import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { installContextMenus } from '@/background/contextMenu';
import {
  buildMenuTree,
  DEFAULT_CONTEXT_MENU_ITEMS,
  type ContextMenuItem,
} from '@/shared/context-menu';
import { decodeCustomMenuId } from '@/shared/context-menu-ids';

const SETTINGS_KEY = 'ega.settings';

function seedStorage(patch: Record<string, unknown>): void {
  chromeMock.storage.local._raw.set(SETTINGS_KEY, patch);
}

beforeEach(() => {
  resetChromeMock();
});

describe('installContextMenus — nested layout (default)', () => {
  it('calls removeAll then create for each node from buildMenuTree', async () => {
    // empty storage → getSettings returns defaults (contextMenuLayout: 'nested')
    await installContextMenus();

    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'nested');
    expect(nodes.length).toBeGreaterThan(1);

    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(nodes.length);
  });

  it('creates root first with id ega-root and title Ega', async () => {
    await installContextMenus();

    const calls = (chromeMock.contextMenus.create as Mock).mock.calls as Array<
      [chrome.contextMenus.CreateProperties]
    >;
    const firstCall = calls[0]?.[0];
    if (!firstCall) throw new Error('no create call');
    expect(firstCall.id).toBe('ega-root');
    expect(firstCall.title).toBe('Ega');
    expect(firstCall.parentId).toBeUndefined();
  });

  it('creates each child with parentId ega-root and correct contexts', async () => {
    await installContextMenus();

    const calls = (chromeMock.contextMenus.create as Mock).mock.calls as Array<
      [chrome.contextMenus.CreateProperties]
    >;
    const children = calls.slice(1).map(([p]) => p);

    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'nested').slice(1);
    expect(children).toHaveLength(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
      const child = children[i];
      const node = nodes[i];
      expect(child).toBeDefined();
      expect(child?.parentId).toBe('ega-root');
      expect(child?.id).toBe(node?.id);
      expect(child?.contexts).toEqual(node?.contexts);
    }
  });

  it('removeAll is called before any create', async () => {
    const order: string[] = [];
    (chromeMock.contextMenus.removeAll as Mock).mockImplementation((cb?: () => void) => {
      order.push('removeAll');
      cb?.();
      return Promise.resolve();
    });
    (chromeMock.contextMenus.create as Mock).mockImplementation(() => {
      order.push('create');
    });

    await installContextMenus();

    expect(order[0]).toBe('removeAll');
    expect(order.slice(1).every((x) => x === 'create')).toBe(true);
  });
});

describe('installContextMenus — flat layout', () => {
  beforeEach(() => {
    seedStorage({ contextMenuLayout: 'flat' });
  });

  it('creates no root, items at top level with no parentId', async () => {
    await installContextMenus();

    const nodes = buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, 'flat');
    expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(nodes.length);

    const calls = (chromeMock.contextMenus.create as Mock).mock.calls as Array<
      [chrome.contextMenus.CreateProperties]
    >;
    for (const [p] of calls) {
      expect(p.parentId).toBeUndefined();
    }

    const ids = calls.map(([p]) => p.id);
    expect(ids).not.toContain('ega-root');
  });
});

describe('installContextMenus — site-toggle title after rebuild', () => {
  it('recomputes the site-toggle title for the active tab, not the stored label', async () => {
    seedStorage({ sitePrefs: { 'example.com': { disabled: true } } });
    (chromeMock.tabs.query as Mock).mockResolvedValue([{ url: 'https://example.com/page' }]);

    await installContextMenus();

    expect(chromeMock.contextMenus.update).toHaveBeenCalledWith('ega-toggle-site', {
      title: 'Enable Ega on this site',
    });
  });

  it('skips the title update when no active tab url is available', async () => {
    (chromeMock.tabs.query as Mock).mockResolvedValue([]);

    await installContextMenus();

    expect(chromeMock.contextMenus.update).not.toHaveBeenCalled();
  });
});

describe('installContextMenus — all items disabled', () => {
  it('calls removeAll and zero create calls', async () => {
    const disabled: ContextMenuItem[] = DEFAULT_CONTEXT_MENU_ITEMS.map((item) => ({
      ...item,
      enabled: false,
    }));
    seedStorage({ contextMenuItems: disabled });

    await installContextMenus();

    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(chromeMock.contextMenus.create).not.toHaveBeenCalled();
  });
});

describe('installContextMenus — concurrent invocations serialize', () => {
  it('never creates an id that is already registered (no interleave)', async () => {
    // Models chrome's menu registry: interleaved runs must never create the same id twice.
    const registered = new Set<string>();
    const duplicateCreates: string[] = [];

    (chromeMock.contextMenus.removeAll as Mock).mockImplementation(async (cb?: () => void) => {
      // Async removeAll — yields the microtask queue so a second run can
      // slip in between this and the create loop (the real interleave).
      await Promise.resolve();
      registered.clear();
      cb?.();
    });
    (chromeMock.contextMenus.create as Mock).mockImplementation(
      (props: chrome.contextMenus.CreateProperties) => {
        const id = String(props.id);
        if (registered.has(id)) duplicateCreates.push(id);
        registered.add(id);
      },
    );

    // Fire two unserialized invocations, same as the 3 void-fired sites.
    await Promise.all([installContextMenus(), installContextMenus()]);

    expect(duplicateCreates).toEqual([]);
  });
});

describe('installContextMenus — a stored id that disagrees with its surface', () => {
  it('registers an id encoding the stored surface, so the click can read it with no storage', async () => {
    seedStorage({
      contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
        i.kind === 'image-task' ? { ...i, surface: 'tooltip' } : i,
      ),
    });

    await installContextMenus();

    const calls = (chromeMock.contextMenus.create as Mock).mock.calls as Array<
      [chrome.contextMenus.CreateProperties]
    >;
    const imageIds = calls
      .map(([p]) => String(p.id))
      .filter((id) => id.startsWith('ega-custom-img') || id.endsWith('-image'));
    expect(imageIds).toHaveLength(2);
    for (const id of imageIds) {
      expect(decodeCustomMenuId(id)).toEqual({ kind: 'image-task', surface: 'tooltip' });
    }
  });
});
