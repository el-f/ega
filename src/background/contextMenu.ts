import { getCustomLanguages, getCustomTasks, getSettings } from '@/shared/storage';
import { buildMenuTree } from '@/shared/context-menu';
import { menuItemName, SITE_TOGGLE_TITLES } from '@/shared/context-menu-names';
import { withEncodedMenuIds } from '@/shared/context-menu-ids';
import { materializeTasks, taskLabel } from '@/shared/task-view';
import { materializeVarieties } from '@/shared/varieties';
import { labelFor } from '@/shared/languages';
import { debugCatch } from '@/shared/logger';
import { makeAsyncLock } from '@/shared/utils/async-lock';
import type { Settings } from '@/shared/types';

const SITE_TOGGLE_ID = 'ega-toggle-site';

// Same three schemes parseToggleOrigin accepts, and the same set the content script matches.
const MENU_DOCUMENT_PATTERNS = ['http://*/*', 'https://*/*', 'file://*/*'];

export function computeSiteMenuTitle(disabled: boolean): string {
  return disabled ? SITE_TOGGLE_TITLES.off : SITE_TOGGLE_TITLES.on;
}

/** One transform under the settings lock: a read-then-replace here would drop a memo-direction write that landed in between. Deleting an origin needs `replaceSitePrefs`, because `updateSettings` merges per key. */
export async function handleSiteToggleClick(args: {
  url: string;
  replaceSitePrefs: (
    transform: (cur: Settings['sitePrefs']) => Settings['sitePrefs'],
  ) => Promise<unknown>;
}): Promise<void> {
  const origin = parseToggleOrigin(args.url);
  if (origin === null) return;
  await args.replaceSitePrefs((cur) => {
    const sitePrefs = { ...cur };
    const existing = sitePrefs[origin] ?? { disabled: false };
    const next = { ...existing, disabled: !existing.disabled };
    if (
      next.disabled === false &&
      next.defaultLang === undefined &&
      next.lastDirection === undefined
    ) {
      delete sitePrefs[origin];
    } else {
      sitePrefs[origin] = next;
    }
    return sitePrefs;
  });
}

// Two overlapping runs interleave removeAll and create, so the later create hits a duplicate id.
const installLock = makeAsyncLock();

// Chrome keeps the menu across worker restarts; session storage clears with the browser session and on update.
const MENUS_BUILT_KEY = 'ega.menusBuilt';

/** `skipIfBuilt` is the worker-boot call: it rebuilds only on the first wake of a browser session. */
export async function installContextMenus(opts: { skipIfBuilt?: boolean } = {}): Promise<void> {
  await installLock(async () => {
    if (opts.skipIfBuilt === true) {
      const stored = await chrome.storage.session.get(MENUS_BUILT_KEY);
      if (stored[MENUS_BUILT_KEY] === true) return;
    }
    const [s, customs, languages] = await Promise.all([
      getSettings(),
      getCustomTasks(),
      getCustomLanguages(),
    ]);
    await chrome.contextMenus.removeAll();
    const views = materializeTasks(s, customs);
    const on = new Set(views.filter((v) => !v.disabled).map((v) => v.id));
    const varieties = materializeVarieties(s, languages);
    const lookup = {
      taskLabel: (id: string) => taskLabel(views, id),
      langLabel: (id: string) => varieties.find((v) => v.id === id)?.label ?? labelFor(id),
    };
    // Ids are minted against the full list, as the click handler does; an item whose task is off or gone,
    // and the picker item while the picker is off, are then left out instead of showing as dead entries.
    const items = withEncodedMenuIds(s.contextMenuItems).filter((i) => {
      if (i.kind === 'task' || i.kind === 'image-task') return on.has(i.task);
      return i.kind !== 'pick-element' || s.pickerEnabled;
    });
    const nodes = buildMenuTree(items, (i) => menuItemName(i, lookup));
    for (const n of nodes) {
      chrome.contextMenus.create({
        id: n.id,
        title: n.title,
        // No content script runs anywhere else, so every item there would be dead.
        documentUrlPatterns: MENU_DOCUMENT_PATTERNS,
        // ContextType is `${chrome.contextMenus.ContextType}` — same string values, not assignable without a cast.
        contexts: n.contexts as [
          chrome.contextMenus.ContextType,
          ...chrome.contextMenus.ContextType[],
        ],
        ...(n.parentId !== undefined ? { parentId: n.parentId } : {}),
      });
    }
    await chrome.storage.session.set({ [MENUS_BUILT_KEY]: true });
    // The create loop used the "Disable" title; recompute the site-toggle title for the tab in view.
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const origin = parseToggleOrigin(tab?.url);
      if (origin !== null) await updateSiteToggleTitle(s, origin);
    } catch (e) {
      debugCatch(e, 'background.installContextMenus');
    }
  });
}

/** `origin`, not `host`: the content script gates on `sitePrefs[location.origin]`. */
function parseToggleOrigin(rawUrl: string | undefined): string | null {
  if (typeof rawUrl !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
    return null;
  }
  return parsed.origin;
}

async function updateSiteToggleTitle(s: Settings, origin: string): Promise<void> {
  // Always shown and never renamed: three help messages send users to it by the name it flips to.
  if (!s.contextMenuItems.some((i) => i.kind === 'site-toggle')) return;
  const disabled = s.sitePrefs[origin]?.disabled === true;
  await chrome.contextMenus.update(SITE_TOGGLE_ID, {
    title: computeSiteMenuTitle(disabled),
  });
}

export async function refreshSiteToggleLabel(rawUrl: string | undefined): Promise<void> {
  const origin = parseToggleOrigin(rawUrl);
  if (origin === null) return;
  // Shares installLock: an update landing in a rebuild's removeAll→create window would reject or vanish.
  await installLock(async () => {
    try {
      const s = await getSettings();
      await updateSiteToggleTitle(s, origin);
    } catch (e) {
      debugCatch(e, 'background.refreshSiteToggleLabel');
    }
  });
}
