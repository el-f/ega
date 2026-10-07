import { flushSync, mount, unmount } from 'svelte';
import { debugCatch } from '@/shared/logger';
import { ensureShadowSheet, getContainer } from '../shadowHost';
import type { RenderMode } from '../page-translate-v2/store';
import PickerBar from './PickerBar.svelte';
import css from './picker-bar.css?inline';

interface BarExports {
  set: (s: {
    status?: string;
    blocked?: boolean;
    canTranslate?: boolean;
    mode?: RenderMode;
  }) => void;
  flash: (text: string) => void;
  announce: (text: string) => void;
  closeKeys: () => boolean;
  focusKeys: () => void;
}

export interface PickerBarHandle extends BarExports {
  readonly anchor: HTMLDivElement;
  destroy(): void;
}

/** Tab walks blocks, so a keyboard user hears once how to reach the bar. Spelled out: "?" alone is often not read. */
const KEYS_HINT = 'Press the question mark key for the bar and its keys.';
/** Long enough for a screen reader to register the empty live region before it changes. */
const HINT_DELAY_MS = 400;

/** Mounts the one bottom bar both picker modes share. */
export function mountPickerBar(props: {
  kind: 'pick' | 'areas';
  initialStatus: string;
  initialMode?: RenderMode;
  onCancel: () => void;
  onTranslate?: () => void;
  onModeSelect?: (mode: RenderMode) => void;
}): PickerBarHandle {
  ensureShadowSheet('ega-picker-bar-styles', css);
  const anchor = document.createElement('div');
  anchor.setAttribute('data-ega-picker-bar-wrap', '');
  getContainer().appendChild(anchor);
  const handle = mount(PickerBar, { target: anchor, props }) as unknown as BarExports &
    Record<string, unknown>;
  // A cursor move spoken first wins: the hint never talks over what the user just did.
  let spoke = false;
  const hint = setTimeout(() => {
    if (!spoke) flushSync(() => handle.announce(KEYS_HINT));
  }, HINT_DELAY_MS);
  return {
    anchor,
    // Synchronous, so the live region and the status match the page state the moment a key is handled.
    set: (s) => flushSync(() => handle.set(s)),
    flash: (t) => flushSync(() => handle.flash(t)),
    announce: (t) => {
      spoke = true;
      flushSync(() => handle.announce(t));
    },
    closeKeys: () => {
      let closed = false;
      flushSync(() => (closed = handle.closeKeys()));
      return closed;
    },
    focusKeys: () => flushSync(() => handle.focusKeys()),
    destroy: () => {
      clearTimeout(hint);
      try {
        void unmount(handle);
      } catch (e) {
        debugCatch(e, 'content.pickerBar.unmount');
      }
      anchor.remove();
    },
  };
}
