import { BACKEND_API_KEY_FIELDS, instantiateAll, resolveBackend } from '@/shared/backends/registry';
import { createRouter } from './router';
import { TranslationCache } from './cache';
import { createCancelToken } from '@/shared/cancel-token';
import { handleNativeTest } from './native-test';
import { DEFAULT_TRANSLATE_TIMEOUT_MS, STORAGE_KEYS } from '@/shared/constants';
import {
  getSettings as readSettings,
  getCustomLanguages,
  getCustomTasks,
  updateSettings,
  replaceSitePrefs,
} from '@/shared/storage';
import { handleSiteToggleClick, installContextMenus, refreshSiteToggleLabel } from './contextMenu';
import { DEFAULT_CONTEXT_MENU_ITEMS, resolveMenuAction } from '@/shared/context-menu';
import { decodeCustomMenuId, withEncodedMenuIds } from '@/shared/context-menu-ids';
import { pushAuditEntry, clearAuditLog, type AuditSurface } from '@/shared/audit-log';
import { handleConversationsDelete } from './conversations-delete';
import { createLogger, debugCatch } from '@/shared/logger';
import { asLangIdUnsafe } from '@/shared/brands';
import { hasKnownKind, type Msg, type MsgReply } from '@/shared/messages';
import { readForContent } from './content-reads';
import type { ChatTurn } from '@/shared/chat-history';
import { fenceHistoryTurn } from '@/shared/prompts';
import type { PageContext, Settings } from '@/shared/types';
import { parseSettingsPatch, resolveModelId } from '@/shared/settings-schema';
import { assertNever } from '@/shared/invariants';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import { dispatchImageTranslate } from './imageTranslateDispatch';
import { openSidePanelWithHandoff, type OpenSidePanelHandoff } from './openSidePanelHandoff';
import { writePendingPopupHandoff } from '@/shared/pending-popup-handoff';
import {
  getStatus as getNativePortStatus,
  warm as warmNativeSession,
} from '@/shared/cli-session/port-manager';
import { resolvePreWarmProvider } from './pre-warm';
import { getPerfEntries } from '@/shared/perf-history';
import { openOptionsTab } from '@/shared/open-options-tab';
import { defaultProbe } from '@/shared/translate-ui';
import { CONTENT_MIRRORED_KEYS } from '@/shared/stored-changes';
import type { ImageTask } from '@/shared/task-prompts';

const logger = createLogger('bg');

self.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  logger.error('unhandledrejection', ev.reason);
});
self.addEventListener('error', (ev: ErrorEvent) => {
  logger.error('uncaught error', ev.error ?? ev.message);
});

// e2e builds never reach a host installed on the test machine; a spec-side patch dies with each SW restart.
if (__EGA_E2E_HOOKS__) {
  chrome.runtime.connectNative = () => {
    const port = {
      name: 'ega-e2e-blocked',
      onMessage: { addListener: () => undefined, removeListener: () => undefined },
      onDisconnect: {
        addListener: (fn: (p: chrome.runtime.Port) => void) => setTimeout(() => fn(port), 0),
        removeListener: () => undefined,
      },
      postMessage: () => undefined,
      disconnect: () => undefined,
    } as unknown as chrome.runtime.Port;
    return port;
  };
}

const cache = new TranslationCache();

// One storage read serves every consumer until the next settings write; a rejected read is not kept.
let settingsMemo: Promise<Settings> | undefined;
function getSettings(): Promise<Settings> {
  settingsMemo ??= readSettings().catch((e: unknown) => {
    settingsMemo = undefined;
    throw e;
  });
  return settingsMemo;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    return host || undefined;
  } catch {
    return undefined;
  }
}
/** Owning tab per in-flight request; the entry is dropped when the request ends. */
const requestTab = new Map<string, number>();

function trackRequestTab(tabId: number): (requestId: string) => () => void {
  return (requestId) => {
    requestTab.set(requestId, tabId);
    return () => {
      requestTab.delete(requestId);
    };
  };
}

// Spawn the CLI child at boot so the first translate is not cold; fire-and-forget and idempotent.
async function maybePreWarmNative(): Promise<void> {
  try {
    const s = await getSettings();
    const provider = resolvePreWarmProvider(s);
    if (provider === null) return;
    void warmNativeSession(provider, 30_000, resolveModelId(s.model, 'native') || undefined);
  } catch (e) {
    logger.warn('preWarmNative failed', e);
  }
}
void maybePreWarmNative();

// Matches the schema max of `headingTrailDepth`.
const MAX_HEADING_TRAIL_ENTRIES = 10;
export const MAX_HISTORY_TURNS = 40;

const cap = (v: string): string =>
  v.length > MAX_SELECTION_CHARS ? v.slice(0, MAX_SELECTION_CHARS) : v;

function withoutApiKeys(s: Settings): Settings {
  const copy: Record<string, unknown> = { ...s };
  for (const k of BACKEND_API_KEY_FIELDS) delete copy[k];
  return copy as unknown as Settings;
}

type TranslateStartOptions = Extract<Msg, { kind: 'translate:start' }>['options'];

// An install or update orphans every content script already on a page; only a reload replaces it.
const TAB_UNREACHABLE_HINT = 'Ega cannot reach this page — reload it and try again.';
const SELECTION_WAITING_HINT =
  'Ega cannot reach this page, so your selection went to the side panel. If the panel is closed, open it within a minute, or reload the page and try again.';

// The action calls reject (not throw) for a tab that closed in between; Promise.resolve also covers a mock that returns void.
function markTabNeedsReload(tabId: number, title = TAB_UNREACHABLE_HINT): void {
  const swallow = (e: unknown): void => debugCatch(e, 'background.markTabNeedsReload');
  Promise.resolve(chrome.action.setBadgeText({ tabId, text: '!' })).catch(swallow);
  Promise.resolve(chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' })).catch(
    swallow,
  );
  Promise.resolve(chrome.action.setTitle({ tabId, title })).catch(swallow);
}

function clearTabReloadHint(tabId: number): void {
  const swallow = (e: unknown): void => debugCatch(e, 'background.clearTabReloadHint');
  Promise.resolve(chrome.action.setBadgeText({ tabId, text: '' })).catch(swallow);
  Promise.resolve(chrome.action.setTitle({ tabId, title: '' })).catch(swallow);
}

/** These actions live only in the page, so a dead tab gets the reload hint instead. */
async function sendToContentScript(
  tabId: number,
  pageUrl: string | undefined,
  msg: Msg,
  where: string,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    clearTabReloadHint(tabId);
  } catch (e) {
    debugCatch(e, where);
    // No content script ever runs elsewhere; without the tabs permission such a page's url reads undefined.
    if (pageUrl !== undefined && /^(?:https?|file):/.test(pageUrl)) markTabNeedsReload(tabId);
  }
}

/** Only the panel in the sending window drains the handoff, so a second window cannot steal it. */
function stampWindow<T>(handoff: T, windowId: number | undefined): T & { windowId?: number } {
  return { ...handoff, ...(windowId !== undefined ? { windowId } : {}) };
}

/** The gesture expired at the first await, so no open() here: a panel already open drains the handoff, a later one within its age limit. */
async function parkSelectionForSidePanel(
  tabId: number,
  handoff: OpenSidePanelHandoff,
  windowId?: number,
): Promise<void> {
  try {
    await writePendingPopupHandoff(stampWindow(handoff, windowId));
    markTabNeedsReload(tabId, SELECTION_WAITING_HINT);
  } catch (e) {
    debugCatch(e, 'bg.ctx.selection-fallback');
    markTabNeedsReload(tabId);
  }
}

/** The options page opens in a tab, so `sender.tab` alone cannot tell it from a content script. */
function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.startsWith(chrome.runtime.getURL('')) === true;
}

/** The audit entry records who asked. A tab means the content script; an extension page names itself in `sender.url`. */
function senderSurface(sender: chrome.runtime.MessageSender): AuditSurface {
  if (sender.tab !== undefined) return 'content';
  const path = sender.url ?? '';
  if (path.includes('sidepanel')) return 'sidepanel';
  if (path.includes('popup')) return 'popup';
  if (path.includes('options')) return 'options';
  return 'unknown';
}

/** Trust boundary: the panel's history trim is sender-side, and replayed turns carry page text, so each is fenced like the selection. */
function boundedOptions(o: TranslateStartOptions): TranslateStartOptions {
  const raw: unknown[] = Array.isArray(o.conversationHistory) ? o.conversationHistory : [];
  const history = raw
    .filter(
      (t): t is ChatTurn =>
        typeof t === 'object' &&
        t !== null &&
        ((t as ChatTurn).role === 'user' || (t as ChatTurn).role === 'assistant') &&
        typeof (t as ChatTurn).content === 'string',
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => fenceHistoryTurn({ role: t.role, content: cap(t.content) }));
  return {
    ...o,
    ...(typeof o.refinement === 'string' ? { refinement: cap(o.refinement) } : {}),
    ...(o.conversationHistory !== undefined ? { conversationHistory: history } : {}),
  };
}

/** Trust boundary: a forged translate:start can carry unbounded page-context strings into the redaction regexes and the prompt. */
function boundedContext(c: PageContext): PageContext {
  const out: PageContext = {};
  if (c.pageTitle !== undefined) out.pageTitle = cap(c.pageTitle);
  if (c.pageUrl !== undefined) out.pageUrl = cap(c.pageUrl);
  if (c.pageLang !== undefined) out.pageLang = cap(c.pageLang);
  if (c.pageDescription !== undefined) out.pageDescription = cap(c.pageDescription);
  if (c.siteName !== undefined) out.siteName = cap(c.siteName);
  if (c.headingTrail !== undefined) {
    out.headingTrail = c.headingTrail.slice(0, MAX_HEADING_TRAIL_ENTRIES).map(cap);
  }
  if (c.beforeText !== undefined) out.beforeText = cap(c.beforeText);
  if (c.afterText !== undefined) out.afterText = cap(c.afterText);
  if (c.postText !== undefined) out.postText = cap(c.postText);
  return out;
}

// Deny-list, not allow-list: an allow-list of prompt-shaping fields drifts as settings are added.
const CACHE_SAFE_SETTINGS_KEYS = new Set(['sitePrefs', 'theme']);
// Only these keys shape the menu tree or the site-toggle title; pickerEnabled drops the picker item.
const MENU_SETTINGS_KEYS = [
  'contextMenuItems',
  'sitePrefs',
  'disabledTasks',
  'pickerEnabled',
] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function keyChanged(a: Record<string, unknown>, b: Record<string, unknown>, k: string): boolean {
  return JSON.stringify(a[k]) !== JSON.stringify(b[k]);
}

function menuShapeChanged(oldV: unknown, newV: unknown): boolean {
  const a = asRecord(oldV);
  const b = asRecord(newV);
  if (!a || !b) return true;
  return MENU_SETTINGS_KEYS.some((k) => keyChanged(a, b, k));
}

// Per-key compare with early exit, so a hot-path write never pays two full-settings stringifies.
function promptShapeChanged(oldV: unknown, newV: unknown): boolean {
  const a = asRecord(oldV);
  const b = asRecord(newV);
  if (!a || !b) return true;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (CACHE_SAFE_SETTINGS_KEYS.has(k)) continue;
    if (keyChanged(a, b, k)) return true;
  }
  return false;
}

/** Content scripts listen for this instead of storage.local, which would hand every tab each thread save. */
function tellTabsStoredChanged(changes: Record<string, unknown>): void {
  const keys = CONTENT_MIRRORED_KEYS.filter((k) => k in changes);
  if (keys.length === 0) return;
  const msg: Msg = { kind: 'content:storage-changed', keys };
  void (async () => {
    for (const t of await chrome.tabs.query({})) {
      // A tab with no content script rejects; that is the normal case for chrome:// pages.
      if (t.id !== undefined) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
    }
  })().catch((e: unknown) => debugCatch(e, 'background.tellTabsStoredChanged'));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  tellTabsStoredChanged(changes);
  // An edited custom-language definition changes the prompt, so its old cached answers can go at once.
  // Its name can be in a menu title ("Translate into …"), so the menu rebuilds too.
  if (changes[STORAGE_KEYS.customLanguages]) {
    void cache.clear();
    void installContextMenus();
  }
  const tasksChanged = STORAGE_KEYS.customTasks in changes;
  // An edited custom task runs a new prompt under the same id, and its menu items may need to go.
  if (tasksChanged) {
    void cache.clear();
    void installContextMenus();
  }
  const change = changes[STORAGE_KEYS.settings];
  // Custom languages and tasks too: the sanitized settings are read against them.
  if (change || changes[STORAGE_KEYS.customLanguages] || tasksChanged) settingsMemo = undefined;
  if (!change) return;
  // Unconditional: a key or host just saved must take effect without waiting out the probe TTL.
  router.clearProbes();
  // installContextMenus calls removeAll() first, so re-registering cannot raise a duplicate-id error.
  if (menuShapeChanged(change.oldValue, change.newValue)) void installContextMenus();
  if (promptShapeChanged(change.oldValue, change.newValue)) void cache.clear();
});
const router = createRouter({
  backends: instantiateAll(),
  getSettings,
  getCustomLanguages,
  getCustomTasks,
  cache,
  logger,
});

// Every chrome.* listener registers at module top level: an await before addListener lets Chrome drop the events that wake the worker.

chrome.runtime.onInstalled.addListener((details) => {
  void installContextMenus();
  // Nothing works until a backend has a key, so the first run lands on that page.
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});

// A worker restart re-runs this module without onInstalled; a browser restart needs the menu rebuilt.
void installContextMenus({ skipIfBuilt: true });

// Session storage holds handoffs with another site's text, so no content script may read it.
const sessionAccessReady: Promise<void> = (async () => {
  try {
    const session = (
      chrome.storage as unknown as {
        session?: {
          setAccessLevel?: (opts: { accessLevel: string }) => Promise<void>;
        };
      }
    ).session;
    if (session?.setAccessLevel) {
      await session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    }
  } catch (e) {
    logger.warn('storage.session.setAccessLevel failed', e);
  }
})();

try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
} catch (e) {
  debugCatch(e, 'background.setPanelBehavior');
}

chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
  // The manifest has no `externally_connectable`, so this reject only guards a future manifest change.
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'forbidden' });
    return false;
  }
  if (!hasKnownKind(rawMsg)) return false;
  const msg = rawMsg as Msg;
  // Ties each case's answer to MsgReply[kind], so a renamed reply field fails here, not in a consumer's cast.
  const reply = <K extends Msg['kind']>(_kind: K, r: MsgReply[K]): void => sendResponse(r);
  switch (msg.kind) {
    case 'translate:start': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) requestTab.set(msg.requestId, tabId);
      const forward = (chunkMsg: Msg) => {
        if (tabId !== undefined) {
          // Swallowed on purpose: a delta rejected mid-navigation must not badge the new, working document as "reload".
          chrome.tabs.sendMessage(tabId, chunkMsg).catch(() => {});
        } else {
          chrome.runtime.sendMessage(chunkMsg).catch(() => {});
        }
      };
      // Don't trust caller — content script caps at MAX_SELECTION_CHARS,
      // but an injected message could bypass.
      const boundedText =
        msg.text.length > MAX_SELECTION_CHARS ? msg.text.slice(0, MAX_SELECTION_CHARS) : msg.text;
      void (async () => {
        let targetLang = msg.targetLang;
        if (!targetLang) {
          try {
            const s = await getSettings();
            targetLang = s.defaultTargetLang;
          } catch {
            targetLang = asLangIdUnsafe('en');
          }
        }
        // Only a tab has a page host; a popup or side-panel sender is an extension URL and falls back to context.pageUrl.
        const pageHost = hostOf(sender.tab?.url);
        return router.handleTranslate(
          {
            id: msg.requestId,
            text: boundedText,
            sourceLang: msg.sourceLang,
            targetLang,
            ...(msg.context ? { context: boundedContext(msg.context) } : {}),
            ...(pageHost !== undefined ? { pageHost } : {}),
            options: boundedOptions(msg.options),
          },
          (chunk) => {
            if (chunk.type !== 'delta') requestTab.delete(msg.requestId);
            forward({ kind: 'translate:chunk', chunk });
          },
          { surface: senderSurface(sender) },
        );
      })().catch((e) => logger.error('translate failed', e));
      reply(msg.kind, { ok: true });
      return true;
    }
    case 'translate:cancel':
      // A page's content script may stop only its own tab's request.
      if (isExtensionPage(sender) || requestTab.get(msg.requestId) === sender.tab?.id) {
        router.cancel(msg.requestId);
      }
      reply(msg.kind, { ok: true });
      return true;
    case 'translate:cancel-all':
      if (isExtensionPage(sender)) router.cancelAll();
      reply(msg.kind, { ok: true });
      return true;
    case 'settings:update': {
      void (async () => {
        try {
          let parsed: Record<string, unknown>;
          try {
            parsed = parseSettingsPatch(msg.patch) as Record<string, unknown>;
          } catch (e) {
            debugCatch(e, 'background.settings:update.schema');
            reply(msg.kind, { ok: false, reason: 'schema' });
            return;
          }
          // Strip `key: undefined` entries valibot emits for omitted optionals
          // so Partial<Settings> accepts the shape (exactOptionalPropertyTypes).
          const cleaned: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (v !== undefined) cleaned[k] = v;
          }
          let merged;
          try {
            merged = await updateSettings(cleaned);
          } catch (e) {
            // chrome.storage.local reports a quota failure only in the error message, so this has to string-match.
            const msgText = e instanceof Error ? e.message : String(e);
            const isQuota = /QUOTA/i.test(msgText);
            debugCatch(e, 'background.settings:update.write');
            reply(msg.kind, { ok: false, reason: isQuota ? 'quota' : 'unknown' });
            return;
          }
          // No flush here: the write fires storage.onChanged in this worker, and that listener owns the one policy.
          // A tab sender caches this ack as-is (settings-cache), so the worker strips the keys here.
          reply(msg.kind, {
            ok: true,
            settings: sender.tab !== undefined ? withoutApiKeys(merged) : merged,
          });
        } catch (e) {
          debugCatch(e, 'background.settings:update');
          reply(msg.kind, { ok: false, reason: 'unknown' });
        }
      })();
      return true;
    }
    case 'ui:open-options':
      try {
        openOptionsTab(msg.tab);
        reply(msg.kind, { ok: true });
      } catch (e) {
        debugCatch(e, 'background.ui:open-options');
        reply(msg.kind, { ok: false });
      }
      return false;
    case 'backend:probe':
      // e2e waitForServiceWorker polls this to know onMessage is live before a real translate:start.
      reply(msg.kind, { ok: true });
      return false;
    case 'backend:probe-all':
      defaultProbe()
        .then((r) => reply(msg.kind, r))
        .catch((e: unknown) => {
          logger.warn('backend:probe-all failed', e);
          reply(msg.kind, { available: {}, active: null });
        });
      return true;
    case 'image:translate': {
      const senderTabId = sender.tab?.id;
      const imageUrl = msg.imageUrl;
      const requestId = msg.requestId;
      void (async () => {
        // An extension page has no tabId and the tooltip surface needs a real tab, so that case broadcasts instead.
        await dispatchImageTranslate({
          tabId: senderTabId ?? -1,
          imageUrl,
          requestId,
          ...(msg.task ? { task: msg.task } : {}),
          ...(msg.surface ? { surface: msg.surface } : {}),
          ...(sender.tab?.windowId !== undefined ? { windowId: sender.tab.windowId } : {}),
          ...(senderTabId !== undefined ? { trackTab: trackRequestTab(senderTabId) } : {}),
          getSettings,
          router,
          broadcast: (m) => {
            void chrome.runtime.sendMessage(m).catch(() => {});
          },
          sendToTab: (tid, m) => {
            if (tid >= 0) {
              void sendToContentScript(tid, sender.tab?.url, m, 'bg.image:translate');
            } else {
              void chrome.runtime.sendMessage(m).catch(() => {});
            }
          },
          logger,
        });
      })().catch((e) => logger.error('image translate dispatch failed', e));
      reply(msg.kind, { ok: true });
      return true;
    }
    case 'native:get-port-status': {
      // The Options page has its own port-manager copy that is always cold, so read the worker's copy instead.
      reply(msg.kind, { ok: true, status: getNativePortStatus() });
      return false;
    }
    case 'native:test': {
      // Spawn through the SW's port-manager, or the diagnostic chip never sees the
      // session frame and reads Cold after a successful test.
      void handleNativeTest(msg, (r) => reply('native:test', r), {
        resolveBackend,
        createCancelToken,
        defaultTimeoutMs: DEFAULT_TRANSLATE_TIMEOUT_MS,
      });
      return true;
    }
    case 'ui:open-sidepanel': {
      // open() must run before any await, or the user-gesture window expires and Chrome refuses to open the panel.
      void openSidePanelWithHandoff({
        ...(msg.handoff ? { handoff: msg.handoff } : {}),
        tabId: sender.tab?.id,
        writeHandoff: (h) => writePendingPopupHandoff(stampWindow(h, sender.tab?.windowId)),
        openSidePanel: (opts) => chrome.sidePanel.open(opts),
        queryActiveTabId: async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          return tab?.id;
        },
        logError: (e) => debugCatch(e, 'background.ui:open-sidepanel'),
      }).then((r) => reply('ui:open-sidepanel', r));
      return true;
    }
    case 'audit:push':
      // Trusted: the sender-id gate above already rejected anything outside this extension.
      void pushAuditEntry({ ...msg.entry, surface: senderSurface(sender) }).catch((e: unknown) =>
        debugCatch(e, 'background.audit:push'),
      );
      reply(msg.kind, { ok: true });
      return false;
    case 'audit:clear':
      void clearAuditLog().then(
        () => reply(msg.kind, { ok: true }),
        (e: unknown) => {
          debugCatch(e, 'background.audit:clear');
          reply(msg.kind, { ok: false });
        },
      );
      return true;
    case 'conversations:delete':
      void handleConversationsDelete(msg.ids, isExtensionPage(sender)).then(
        (r) => reply(msg.kind, r),
        (e: unknown) => {
          debugCatch(e, 'background.conversations:delete');
          reply(msg.kind, { ok: false });
        },
      );
      return true;
    case 'cache:clear':
      void cache.clear();
      reply(msg.kind, { ok: true });
      return false;
    case 'perf:entries':
      // The buffer lives only in this worker instance — the options page asks instead of importing.
      reply(msg.kind, { entries: getPerfEntries() });
      return false;
    case 'content:read-settings':
    case 'content:read-languages':
    case 'content:read-tasks':
      // No reply on a failed read: the caller sees undefined and reads again on its next use.
      readForContent(msg.kind)
        .then((r) => sendResponse(r))
        .catch((e: unknown) => {
          logger.warn(`${msg.kind} failed`, e);
          sendResponse(undefined);
        });
      return true;
    // Listed explicitly so the assertNever below forces a decision on every new Msg kind.
    case 'translate:chunk':
    case 'hotkey:translate':
    case 'ctx:translate-selection':
    case 'page:translateAll':
    case 'picker:enter':
    case 'ega:get-selection':
    case 'ega:get-page-context':
    case 'sidepanel:seed-image-translate':
    case 'content:image-translate-pending':
    case 'content:image-translate-result':
    case 'content:storage-changed':
    case 'audit:append':
      return false;
    default:
      // Runtime reach = hasKnownKind accepted something the type system rejected.
      // Log + no-op rather than throw, keeps the SW listener alive.
      assertNever(msg);
      return false;
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // sidePanel.open() must fire synchronously: an await here expires the user-gesture window and Chrome rejects the open.
  const menuItemId = String(info.menuItemId);
  const defaultAction = resolveMenuAction(menuItemId, DEFAULT_CONTEXT_MENU_ITEMS);
  // A surface edit re-mints the id, so a default id still carries the default surface and a custom id encodes its own.
  const syncAction = decodeCustomMenuId(menuItemId) ?? defaultAction;
  const opensSidePanel =
    syncAction?.surface === 'sidepanel' &&
    (syncAction.kind === 'task' || (syncAction.kind === 'image-task' && !!info.srcUrl));
  // Resolves false when Chrome refused the open; the async block below badges the tab for it.
  const panelOpened: Promise<boolean> | null =
    opensSidePanel && tab?.id !== undefined
      ? chrome.sidePanel
          .open({ tabId: tab.id })
          .then(() => true)
          .catch((e: unknown) => {
            debugCatch(e, 'bg.ctx.sidepanel-open');
            return false;
          })
      : null;

  void (async () => {
    const s = await getSettings();
    const action =
      resolveMenuAction(menuItemId, withEncodedMenuIds(s.contextMenuItems)) ?? defaultAction;
    if (!action) return;

    switch (action.kind) {
      case 'task': {
        if (!tab?.id) return;
        const tabId = tab.id;
        const text = info.selectionText ?? '';
        const handoff: OpenSidePanelHandoff = {
          sourceText: text,
          sourceLang: 'auto',
          targetLang: String(action.targetLang ?? s.defaultTargetLang),
          task: action.task ?? 'translate',
          tone: s.defaultTone,
        };
        if (action.surface === 'sidepanel') {
          try {
            await writePendingPopupHandoff(stampWindow(handoff, tab.windowId));
          } catch (e) {
            debugCatch(e, 'bg.ctx.handoff');
            // The panel already opened on this gesture; an error entry reaches it as a toast.
            void pushAuditEntry({
              task: action.task ?? 'translate',
              sourceLang: 'auto',
              targetLang: String(action.targetLang ?? s.defaultTargetLang),
              backend: 'unknown',
              model: '',
              systemPrompt: '',
              userPrompt: '',
              response: '',
              latencyMs: 0,
              cacheHit: false,
              error: {
                code: 'UNKNOWN',
                message: 'Could not send the selection to the side panel. Try again.',
              },
            }).catch(() => {});
          }
          // After the write, never before it: a hung open must not swallow the selection.
          if (panelOpened !== null && !(await panelOpened)) markTabNeedsReload(tabId);
        } else {
          try {
            await chrome.tabs.sendMessage(tabId, {
              kind: 'ctx:translate-selection',
              text,
              ...(action.task !== undefined ? { task: action.task } : {}),
              ...(action.targetLang !== undefined ? { targetLang: action.targetLang } : {}),
            } satisfies Msg);
            clearTabReloadHint(tabId);
          } catch (e) {
            debugCatch(e, 'bg.ctx.translate-selection');
            await parkSelectionForSidePanel(tabId, handoff, tab.windowId);
          }
        }
        return;
      }
      case 'image-task': {
        if (!tab?.id || !info.srcUrl) return;
        const tabId = tab.id;
        const srcUrl = info.srcUrl;
        // A sidepanel-surface item already opened the panel synchronously above, inside the gesture window.
        const imgTask: ImageTask | undefined =
          action.task === 'translate' || action.task === 'explain' ? action.task : undefined;
        await dispatchImageTranslate({
          tabId,
          imageUrl: srcUrl,
          ...(imgTask !== undefined ? { task: imgTask } : {}),
          ...(action.surface !== undefined ? { surface: action.surface } : {}),
          windowId: tab.windowId,
          trackTab: trackRequestTab(tabId),
          getSettings,
          router,
          broadcast: (msg) => {
            void chrome.runtime.sendMessage(msg).catch(() => {});
          },
          sendToTab: (tid, msg) => {
            void sendToContentScript(tid, tab.url, msg, 'bg.ctx.image-task');
          },
          logger,
        });
        if (action.surface === 'sidepanel' && panelOpened !== null && !(await panelOpened)) {
          markTabNeedsReload(tabId);
        }
        return;
      }
      case 'page-translate': {
        if (!tab?.id) return;
        await sendToContentScript(
          tab.id,
          tab.url,
          { kind: 'page:translateAll' },
          'bg.ctx.page-translate',
        );
        return;
      }
      case 'pick-element': {
        if (!tab?.id) return;
        await sendToContentScript(tab.id, tab.url, { kind: 'picker:enter' }, 'bg.ctx.pick-element');
        return;
      }
      case 'site-toggle': {
        const url = tab?.url;
        if (typeof url !== 'string') return;
        await handleSiteToggleClick({ url, replaceSitePrefs });
        await refreshSiteToggleLabel(url);
        return;
      }
      default: {
        assertNever(action.kind);
        break;
      }
    }
  })().catch((e) => logger.error('context menu action failed', e));
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== 'translate-selection') return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await sendToContentScript(tab.id, tab.url, { kind: 'hotkey:translate' }, 'background.hotkey');
  })().catch((e: unknown) => debugCatch(e, 'background.commands.onCommand'));
});

// A closed tab can never render the answer, so its in-flight requests are billed tokens and a worker held awake for nothing.
chrome.tabs.onRemoved.addListener((closedTabId) => {
  for (const [requestId, owner] of requestTab) {
    if (owner !== closedTabId) continue;
    requestTab.delete(requestId);
    router.cancel(requestId);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    try {
      const tab = await chrome.tabs.get(tabId);
      await refreshSiteToggleLabel(tab.url);
    } catch (e) {
      debugCatch(e, 'background.tabs.onActivated');
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // A new document carries a fresh content script; an orphaned page never reaches 'complete' again.
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete')
    clearTabReloadHint(tabId);
  // One menu item serves every tab, so a background tab's URL would mislabel it.
  if (changeInfo.status !== 'complete' || !tab.active) return;
  void refreshSiteToggleLabel(tab.url);
});

declare global {
  var __egaReady: boolean | undefined;
}

// Readiness flag for tests, set once the session access level is applied.
void sessionAccessReady.then(() => {
  globalThis.__egaReady = true;
});
