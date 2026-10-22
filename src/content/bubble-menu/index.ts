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

/** Three items; the Run task list opens beside the menu and keeps itself on screen. */
const MENU_HEIGHT = 110;
const MENU_WIDTH = 200;

export interface MenuTask {
  id: string;
  label: string;
}

export function closeBubbleMenu(returnFocus = false): void {
  if (!open) return;
  const { handle, anchor, chevron } = open;
  open = null;
  chevron.setAttribute('aria-expanded', 'false');
  // Before the focused item goes: removed first, it would hand the bubble a focusin from nowhere.
  if (returnFocus && chevron.isConnected) chevron.focus();
  try {
    void unmount(handle);
  } catch (e) {
    debugCatch(e, 'content.bubbleMenu.unmount');
  }
  anchor.remove();
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
  opts: {
    focusFirst: boolean;
    hideBubble: () => void;
    /** Where focus was before the bubble; an item chosen from the keyboard gives it back. */
    returnTo?: HTMLElement | null | undefined;
    tasks?: readonly MenuTask[];
    onRunTask?: (id: string) => void;
  },
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
  // Every item removes the bubble and the focused item with it; a pointer press never moved focus.
  const leave = (): void => {
    const fromKeyboard = (chevron.getRootNode() as ShadowRoot).activeElement !== null;
    closeBubbleMenu();
    if (fromKeyboard && opts.returnTo?.isConnected) opts.returnTo.focus();
    opts.hideBubble();
  };
  const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, r.left));
  const handle = mount(BubbleMenu, {
    target: anchor,
    props: {
      left,
      top: Math.max(8, top),
      // The Run task list opens on the side with more room; the list then keeps itself on screen.
      subOnLeft:
        window.innerWidth - (left + MENU_WIDTH) < MENU_WIDTH &&
        left > window.innerWidth - (left + MENU_WIDTH),
      tasks: opts.tasks ?? [],
      onRunTask: (id: string) => {
        leave();
        opts.onRunTask?.(id);
      },
      focusFirst: opts.focusFirst,
      onClose: closeBubbleMenu,
      onSettings: () => {
        leave();
        void sendMsg({ kind: 'ui:open-options', tab: 'selection-bubble' }).catch((e: unknown) =>
          debugCatch(e, 'content.bubbleMenu.settings'),
        );
      },
      onTurnOff: () => {
        leave();
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
