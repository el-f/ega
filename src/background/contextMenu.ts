import { getSettings } from '@/shared/storage';
import { buildMenuTree, DEFAULT_CONTEXT_MENU_ITEMS } from '@/shared/context-menu';
import { withEncodedMenuIds } from '@/shared/context-menu-ids';
import { debugCatch } from '@/shared/logger';
import { makeAsyncLock } from '@/shared/utils/async-lock';
import type { Settings } from '@/shared/types';

const SITE_TOGGLE_ID = 'ega-toggle-site';

// Same three schemes parseToggleOrigin accepts, and the same set the content script matches.
const MENU_DOCUMENT_PATTERNS = ['http://*/*', 'https://*/*', 'file://*/*'];

export function computeSiteMenuTitle(disabled: boolean): string {
  return disabled ? 'Enable Ega on this site' : 'Disable Ega on this site';
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

export async function installContextMenus(): Promise<void> {
  await installLock(async () => {
    const s = await getSettings();
    await chrome.contextMenus.removeAll();
    const nodes = buildMenuTree(withEncodedMenuIds(s.contextMenuItems), s.contextMenuLayout);
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
    // The create loop used the stored label; recompute the site-toggle title for the tab in view.
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const origin = parseToggleOrigin(tab?.url);
      if (origin !== null) await updateSiteToggleTitle(s, origin);
    } catch (e) {
      debugCatch(e, 'background.installContextMenus');
    }
  });
}

const DEFAULT_SITE_TOGGLE_LABEL =
  DEFAULT_CONTEXT_MENU_ITEMS.find((i) => i.kind === 'site-toggle')?.label ??
  'Disable Ega on this site';

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
  const siteToggleItem = s.contextMenuItems.find((i) => i.kind === 'site-toggle');
  if (!siteToggleItem?.enabled) return;
  // Custom label wins — don't overwrite what the user set in Options.
  if (siteToggleItem.label !== DEFAULT_SITE_TOGGLE_LABEL) return;
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
