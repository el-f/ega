import { mount, unmount } from 'svelte';
import { sendMsg } from '@/shared/messages';
import { debugCatch } from '@/shared/logger';
import BubbleMenu from './BubbleMenu.svelte';
import css from './bubble-menu.css?inline';
import { ensureShadowSheet, getContainer, onShadowHostRemount } from '../shadowHost';
import { showToast } from '../toast';

let open: {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  chevron: HTMLElement;
} | null = null;

const MENU_HEIGHT = 80;

export function closeBubbleMenu(returnFocus = false): void {
  if (!open) return;
  const { handle, anchor, chevron } = open;
  open = null;
  chevron.setAttribute('aria-expanded', 'false');
  try {
    void unmount(handle);
  } catch (e) {
    debugCatch(e, 'content.bubbleMenu.unmount');
  }
  anchor.remove();
  if (returnFocus && chevron.isConnected) chevron.focus();
}

/** The host the notices name: no `www.`, and "this page" for a file. */
function hostName(): string {
  return location.hostname.replace(/^www\./, '') || 'this page';
}

async function setSiteEnabled(enabled: boolean): Promise<boolean> {
  try {
    const reply = await sendMsg({ kind: 'site:set-enabled', enabled });
    return reply?.ok === true;
  } catch (e) {
    debugCatch(e, 'content.bubbleMenu.setSite');
    return false;
  }
}

/** Opens the menu under the bubble's group; a second open while one is shown closes it instead. */
export function openBubbleMenu(
  chevron: HTMLElement,
  opts: { focusFirst: boolean; hideBubble: () => void },
): void {
  if (open) {
    closeBubbleMenu(!opts.focusFirst);
    return;
  }
  ensureShadowSheet('ega-bubble-menu-css', css);
  const group = chevron.closest('.bubble-group') ?? chevron;
  const r = group.getBoundingClientRect();
  const below = r.bottom + 4;
  const top = below + MENU_HEIGHT > window.innerHeight - 8 ? r.top - 4 - MENU_HEIGHT : below;
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-bubble-menu', '');
  getContainer().appendChild(anchor);
  chevron.setAttribute('aria-expanded', 'true');
  const handle = mount(BubbleMenu, {
    target: anchor,
    props: {
      left: Math.max(8, Math.min(window.innerWidth - 208, r.left)),
      top: Math.max(8, top),
      focusFirst: opts.focusFirst,
      onClose: closeBubbleMenu,
      onSettings: () => {
        closeBubbleMenu();
        opts.hideBubble();
        void sendMsg({ kind: 'ui:open-options', tab: 'selection-bubble' }).catch((e: unknown) =>
          debugCatch(e, 'content.bubbleMenu.settings'),
        );
      },
      onTurnOff: () => {
        closeBubbleMenu();
        opts.hideBubble();
        void turnOffHere();
      },
    },
  });
  open = { handle, anchor, chevron };
}

async function turnOffHere(): Promise<void> {
  if (!(await setSiteEnabled(false))) {
    showToast("Ega couldn't save this change. Try again.", { kind: 'error' });
    return;
  }
  showToast(`Ega is off on ${hostName()}. Turn it back on from the Ega toolbar button.`, {
    kind: 'info',
    action: {
      label: 'Undo',
      run: () => {
        void setSiteEnabled(true).then((ok) => {
          if (!ok) showToast("Ega couldn't save this change. Try again.", { kind: 'error' });
        });
      },
    },
  });
}

/** The refusal every page action on a site that is off shows, with a way back on. */
export function showSiteOffToast(): void {
  showToast(`Ega is off on ${hostName()}.`, {
    kind: 'warning',
    action: {
      label: 'Turn on',
      run: () => {
        void setSiteEnabled(true).then((ok) => {
          if (ok) showToast(`Ega is on for ${hostName()}.`, { kind: 'success' });
          else showToast("Ega couldn't save this change. Try again.", { kind: 'error' });
        });
      },
    },
  });
}

onShadowHostRemount(() => closeBubbleMenu());
