import { debugCatch } from '@/shared/logger';
import { toastLifetimeMs, type ToastKind } from '@/shared/toast-policy';
import { mount, unmount } from 'svelte';
import Toast from './Toast.svelte';
import { getContainer, onShadowHostRemount } from './shadowHost';

// Mounts into the shared shadow host so the `:host`-scoped tokens style the toast.

interface ActiveToast {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  message: string;
  /** Stays until dismissed. */
  sticky: boolean;
  /** A confirmation with nothing to click that hides itself. */
  plain: boolean;
  dismiss: () => void;
  /** Where focus was before it entered the toast. */
  cameFrom: HTMLElement | null;
}

let active: ActiveToast | null = null;

function tearDown(): void {
  if (!active) return;
  const { handle, anchor, cameFrom } = active;
  const hadFocus = anchor.contains((anchor.getRootNode() as ShadowRoot | Document).activeElement);
  try {
    void unmount(handle);
  } catch (e) {
    debugCatch(e, 'content.toast.1');
  }
  anchor.remove();
  active = null;
  // Removing the focused toast drops focus to the page body; it goes back where it came from.
  const now = document.activeElement;
  if (hadFocus && (now === null || now === document.body) && cameFrom?.isConnected === true) {
    cameFrom.focus({ preventScroll: true });
  }
}

export interface ToastOptions {
  kind?: ToastKind;
  action?: { label: string; run: () => void };
}

/** One toast at a time. Returns a dismiss that only removes this toast, not a later one that replaced it. */
export function showToast(message: string, opts: ToastOptions = {}): () => void {
  if (!message) return () => {};
  const { kind = 'info', action } = opts;
  const sticky = toastLifetimeMs(kind, action) === null;
  const plain = !sticky && action === undefined;
  // The same notice again stays the same toast, so it is not announced twice. A timed one is shown fresh (new timer).
  if (sticky && action === undefined && active?.sticky === true && active.message === message)
    return active.dismiss;
  // A plain confirmation also shows where it happened, so it never pushes out one the user still has to read.
  if (plain && active && !active.plain) return () => {};
  tearDown();
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-toast-wrap', '');
  getContainer().appendChild(anchor);
  let mine: ActiveToast | null = null;
  const dismiss = (): void => {
    if (active === mine) tearDown();
  };
  const handle = mount(Toast, {
    target: anchor,
    props: {
      message,
      kind,
      ondismiss: dismiss,
      ...(action
        ? {
            actionLabel: action.label,
            onaction: () => {
              dismiss();
              action.run();
            },
          }
        : {}),
    },
  });
  const own: ActiveToast = { handle, anchor, message, sticky, plain, dismiss, cameFrom: null };
  anchor.addEventListener('focusin', (e) => {
    const from = e.relatedTarget;
    // A control outside the toast. A window switch back re-focuses the toast with no relatedTarget; the saved one stays.
    if (from instanceof HTMLElement && !anchor.contains(from)) own.cameFrom = from;
  });
  // Focus left the toast for good (a window switch keeps it here): there is nothing to give back later.
  anchor.addEventListener('focusout', () =>
    queueMicrotask(() => {
      if (!anchor.contains((anchor.getRootNode() as ShadowRoot).activeElement)) own.cameFrom = null;
    }),
  );
  mine = own;
  active = own;
  return dismiss;
}

/** A new Ega action started or the page navigated: a notice that waits for the user is out of date. */
export function closeStickyToast(): void {
  if (active?.sticky === true) tearDown();
}

/** Test-only: dismiss any active toast immediately. */
export function dismissToast(): void {
  tearDown();
}

onShadowHostRemount(tearDown);
