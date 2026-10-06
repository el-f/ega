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
}

let active: ActiveToast | null = null;

function tearDown(): void {
  if (!active) return;
  try {
    void unmount(active.handle);
  } catch (e) {
    debugCatch(e, 'content.toast.1');
  }
  active.anchor.remove();
  active = null;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** `expires`: run writes a snapshot taken now, so the toast hides after a while. Default: true for "Undo". */
  action?: { label: string; run: () => void; expires?: boolean };
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
            actionExpires: action.expires,
            onaction: () => {
              dismiss();
              action.run();
            },
          }
        : {}),
    },
  });
  mine = { handle, anchor, message, sticky, plain, dismiss };
  active = mine;
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
