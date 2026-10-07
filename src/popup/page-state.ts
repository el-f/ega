import type { HeldBack, MsgReply } from '@/shared/messages';

/** Pages Chrome never runs a content script on. Only http, https and file pages can host Ega. */
export function pageAccess(url: string | undefined): 'ok' | 'restricted' {
  if (typeof url !== 'string') return 'restricted';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'restricted';
  }
  if (parsed.protocol === 'file:') return 'ok';
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'restricted';
  if (parsed.hostname === 'chromewebstore.google.com') return 'restricted';
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
    return 'restricted';
  }
  return 'ok';
}

/** Ega has no "tabs" permission, so Chrome leaves out the url of every tab its host access does not reach: chrome:// pages, the New Tab page, extension pages. */
export function tabAccess(
  tab: { id?: number | undefined; url?: string | undefined } | null,
  ownTabId: number | undefined,
): 'ok' | 'restricted' | 'unknown' {
  // No tab, or the popup page itself opened as a tab: the actions resolve a page tab on click.
  if (tab?.id === undefined || tab.id === ownTabId) return 'unknown';
  return pageAccess(tab.url);
}

export type PopupPageState = 'restricted' | 'not-running' | 'site-off' | 'held-back' | 'default';

/** What the status line under the site switch says. Site off comes from settings, so it is right on a dead page too. */
export function popupPageState(a: {
  /** 'unknown': no tab, or the popup page itself is the active tab; the actions then resolve a tab on click. */
  access: 'ok' | 'restricted' | 'unknown';
  /** The page's answer to ega:get-selection; undefined when it never answered in time. */
  reply: MsgReply['ega:get-selection'] | undefined;
  /** Nothing received the message: the page was open before Ega was installed or updated. */
  rejected: boolean;
  siteOff: boolean;
}): PopupPageState {
  if (a.access === 'restricted') return 'restricted';
  if (a.access === 'unknown') return 'default';
  if (a.siteOff) return 'site-off';
  if (a.rejected) return 'not-running';
  if (a.reply?.heldBack !== undefined) return 'held-back';
  return 'default';
}

export function heldBackText(h: HeldBack): string {
  switch (h.reason) {
    case 'english':
      return 'Bubble hidden: the text looks like English.';
    case 'too-short':
      return h.minLength !== undefined
        ? `Bubble hidden: the selection is shorter than ${h.minLength} characters.`
        : 'Bubble hidden: the selection is too short.';
    case 'mode-never':
      return 'The selection bubble is off in Settings.';
  }
}

/** The host the switch names: no `www.`, and a long one keeps both ends. */
export function siteLabel(url: string | undefined): { full: string; short: string } {
  let host = '';
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    /* no URL: falls through to "this page" */
  }
  const full = host.replace(/^www\./, '') || 'this page';
  const MAX = 30;
  const short = full.length > MAX ? `${full.slice(0, 14)}…${full.slice(-14)}` : full;
  return { full, short };
}

/** How long the popup waits for the page before treating it as running with nothing held back. */
const PAGE_REPLY_TIMEOUT_MS = 500;

/** One same-tick question to the page: its selection and why the bubble stayed hidden. */
export async function askPage(
  tabId: number,
  send: (tabId: number) => Promise<MsgReply['ega:get-selection'] | undefined>,
): Promise<{ reply: MsgReply['ega:get-selection'] | undefined; rejected: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), PAGE_REPLY_TIMEOUT_MS);
  });
  try {
    const got = await Promise.race([send(tabId), late]);
    // A slow page is not a dead content script.
    if (got === 'late') return { reply: undefined, rejected: false };
    return { reply: got, rejected: false };
  } catch {
    return { reply: undefined, rejected: true };
  } finally {
    clearTimeout(timer);
  }
}
