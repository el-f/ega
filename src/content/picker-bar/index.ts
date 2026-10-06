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
}

export interface PickerBarHandle extends BarExports {
  readonly anchor: HTMLDivElement;
  destroy(): void;
}

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
  return {
    anchor,
    // Synchronous, so the live region and the status match the page state the moment a key is handled.
    set: (s) => flushSync(() => handle.set(s)),
    flash: (t) => flushSync(() => handle.flash(t)),
    announce: (t) => flushSync(() => handle.announce(t)),
    destroy: () => {
      try {
        void unmount(handle);
      } catch (e) {
        debugCatch(e, 'content.pickerBar.unmount');
      }
      anchor.remove();
    },
  };
}
