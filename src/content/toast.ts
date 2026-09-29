import { debugCatch } from '@/shared/logger';
import { mount, unmount } from 'svelte';
import Toast from './components/Toast.svelte';
import { getContainer, onShadowHostRemount } from './shadowHost';

// Mounts into the shared shadow host so the `:host`-scoped tokens style the toast.

interface ActiveToast {
  handle: ReturnType<typeof mount>;
  anchor: HTMLDivElement;
  timeoutId: ReturnType<typeof setTimeout>;
}

let active: ActiveToast | null = null;

function tearDown(): void {
  if (!active) return;
  clearTimeout(active.timeoutId);
  try {
    void unmount(active.handle);
  } catch (e) {
    debugCatch(e, 'content.toast.1');
  }
  active.anchor.remove();
  active = null;
}

const TTL_MS = 3000;
// An action has to be read and clicked, so it outlives a plain notice.
const ACTION_TTL_MS = 12_000;

export function showToast(message: string, action?: { label: string; run: () => void }): void {
  if (!message) return;
  tearDown();
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-toast-wrap', '');
  getContainer().appendChild(anchor);
  const handle = mount(Toast, {
    target: anchor,
    props: {
      message,
      ...(action
        ? {
            actionLabel: action.label,
            onaction: () => {
              tearDown();
              action.run();
            },
          }
        : {}),
    },
  });
  const timeoutId = setTimeout(
    () => {
      tearDown();
    },
    action ? ACTION_TTL_MS : TTL_MS,
  );
  active = { handle, anchor, timeoutId };
}

/** Test-only: dismiss any active toast immediately. */
export function dismissToast(): void {
  tearDown();
}

onShadowHostRemount(tearDown);
