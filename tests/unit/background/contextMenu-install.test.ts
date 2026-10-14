import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { installContextMenus } from '@/background/contextMenu';
import {
  buildMenuTree,
  DEFAULT_CONTEXT_MENU_ITEMS,
  type ContextMenuItem,
} from '@/shared/context-menu';

const tree = () => buildMenuTree(DEFAULT_CONTEXT_MENU_ITEMS, () => '');

function created(): chrome.contextMenus.CreateProperties[] {
  return (
    (chromeMock.contextMenus.create as Mock).mock.calls as Array<
      [chrome.contextMenus.CreateProperties]
    >
  ).map(([p]) => p);
}
import { decodeCustomMenuId } from '@/shared/context-menu-ids';

const SETTINGS_KEY = 'ega.settings';

function seedStorage(patch: Record<string, unknown>): void {
  chromeMock.storage.local._raw.set(SETTINGS_KEY, patch);
}

beforeEach(() => {
  resetChromeMock();
});

describe('installContextMenus — the default menu', () => {
  it('calls removeAll then create for each node from buildMenuTree', async () => {
    await installContextMenus();

    const nodes = tree();
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

    const nodes = tree().slice(1);
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

describe('installContextMenus — what Chrome shows', () => {
  it('titles the default items with their automatic names, none ending in "with Ega"', async () => {
    await installContextMenus();
    expect(created().map((p) => p.title)).toEqual([
      'Ega',
      'Translate',
      'Translate in side panel',
      'Translate image in side panel',
      'Explain image in side panel',
      'Translate this page',
      'Pick an element to translate',
      'Disable Ega on this site',
    ]);
  });

  it('shows new names to a profile that stored the old ones', async () => {
    seedStorage({
      contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
        i.id === 'ega-translate-selection' ? { ...i, label: 'Translate selection with Ega' } : i,
      ),
    });
    await installContextMenus();
    expect(created().find((p) => p.id === 'ega-translate-selection')?.title).toBe('Translate');
  });

  it('a stored flat layout still builds the Ega root: the setting is ignored', async () => {
    seedStorage({ contextMenuLayout: 'flat' });
    await installContextMenus();
    const all = created();
    expect(all[0]?.id).toBe('ega-root');
    expect(all.slice(1).every((p) => p.parentId === 'ega-root')).toBe(true);
  });

  it('leaves the picker item out while the element picker is off', async () => {
    seedStorage({ pickerEnabled: false });
    await installContextMenus();
    const ids = created().map((p) => p.id);
    expect(ids).not.toContain('ega-pick-element');
    expect(ids).toContain('ega-translate-page');
  });

  it('keeps the site toggle when an older version stored it hidden or renamed', async () => {
    seedStorage({
      contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS.map((i) =>
        i.kind === 'site-toggle' ? { ...i, enabled: false, label: 'Off switch' } : i,
      ),
    });
    await installContextMenus();
    expect(created().find((p) => p.id === 'ega-toggle-site')?.title).toBe(
      'Disable Ega on this site',
    );
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

describe('installContextMenus — all items unchecked', () => {
  it('registers only the site toggle under the root', async () => {
    const disabled: ContextMenuItem[] = DEFAULT_CONTEXT_MENU_ITEMS.map((item) => ({
      ...item,
      enabled: false,
    }));
    seedStorage({ contextMenuItems: disabled });

    await installContextMenus();

    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(created().map((p) => p.id)).toEqual(['ega-root', 'ega-toggle-site']);
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

describe('installContextMenus — the worker boot rebuild', () => {
  it('builds the menu on the first wake of a browser session', async () => {
    await installContextMenus({ skipIfBuilt: true });

    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(chromeMock.contextMenus.create).toHaveBeenCalled();
  });

  it('skips the rebuild on a later wake: Chrome keeps the menu across worker restarts', async () => {
    await installContextMenus({ skipIfBuilt: true });
    (chromeMock.contextMenus.removeAll as Mock).mockClear();
    (chromeMock.contextMenus.create as Mock).mockClear();

    await installContextMenus({ skipIfBuilt: true });

    expect(chromeMock.contextMenus.removeAll).not.toHaveBeenCalled();
    expect(chromeMock.contextMenus.create).not.toHaveBeenCalled();
  });

  it('a settings change or an install still rebuilds after the boot one', async () => {
    await installContextMenus({ skipIfBuilt: true });
    (chromeMock.contextMenus.removeAll as Mock).mockClear();

    await installContextMenus();

    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledOnce();
  });

  it('a build that failed leaves the next wake to try again', async () => {
    (chromeMock.contextMenus.removeAll as Mock).mockRejectedValueOnce(new Error('busy'));
    await expect(installContextMenus({ skipIfBuilt: true })).rejects.toThrow('busy');

    await installContextMenus({ skipIfBuilt: true });

    expect(chromeMock.contextMenus.create).toHaveBeenCalled();
  });
});
