import { debugCatch } from '@/shared/logger';
import { toastHidesItself, type ToastKind } from '@/shared/toast-policy';
import { mount, unmount } from 'svelte';
import Toast from './Toast.svelte';
import { getContainer, onShadowHostRemount } from './shadowHost';

// Mounts into the shared shadow host so the `:host`-scoped tokens style the toast.

interface ActiveToast {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  hidesItself: boolean;
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
  action?: { label: string; run: () => void };
}

/** One toast at a time. Returns a dismiss that only removes this toast, not a later one that replaced it. */
export function showToast(message: string, opts: ToastOptions = {}): () => void {
  if (!message) return () => {};
  const { kind = 'info', action } = opts;
  const hidesItself = toastHidesItself(kind, action !== undefined);
  // A plain confirmation also shows where it happened, so it never pushes out one the user still has to read.
  if (hidesItself && active !== null && !active.hidesItself) return () => {};
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
  mine = { handle, anchor, hidesItself };
  active = mine;
  return dismiss;
}

/** Test-only: dismiss any active toast immediately. */
export function dismissToast(): void {
  tearDown();
}

onShadowHostRemount(tearDown);
