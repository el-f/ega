import { mount, unmount } from 'svelte';
import { debugCatch } from '@/shared/logger';
import { getContainer, onShadowHostRemount } from './shadowHost';
import type { PickResult, PickerController } from './picker';
import type * as PickerMod from './picker';
import type PickerOverlayDefault from './PickerOverlay.svelte';

let pickerBundleP: Promise<{
  pickerMod: typeof PickerMod;
  PickerOverlay: typeof PickerOverlayDefault;
}> | null = null;
function lazyPicker(): Promise<{
  pickerMod: typeof PickerMod;
  PickerOverlay: typeof PickerOverlayDefault;
}> {
  return (pickerBundleP ??= (async () => {
    const [pickerMod, overlayMod] = await Promise.all([
      import('./picker'),
      import('./PickerOverlay.svelte'),
    ]);
    return { pickerMod, PickerOverlay: overlayMod.default };
  })());
}

let pickerOverlayHandle: ReturnType<typeof mount> | null = null;
let pickerOverlayAnchor: HTMLDivElement | null = null;
let pickerHoverState: { rect: DOMRect } | null = null;
let pickerSingleton: PickerController | null = null;
let PickerOverlayComp: typeof PickerOverlayDefault | null = null;

function mountPickerOverlay(): void {
  if (!PickerOverlayComp) return;
  const c = getContainer();
  pickerOverlayAnchor = document.createElement('div');
  pickerOverlayAnchor.setAttribute('data-ega-picker-wrap', '');
  c.appendChild(pickerOverlayAnchor);
  pickerOverlayHandle = mount(PickerOverlayComp, { target: pickerOverlayAnchor });
}

function unmountPickerOverlay(): void {
  if (pickerOverlayHandle) {
    try {
      void unmount(pickerOverlayHandle);
    } catch (e) {
      debugCatch(e, 'content.picker.unmount');
    }
    pickerOverlayHandle = null;
  }
  if (pickerOverlayAnchor) {
    pickerOverlayAnchor.remove();
    pickerOverlayAnchor = null;
  }
  pickerHoverState = null;
}

// exit() runs onExit -> unmountPickerOverlay; leaving the picker armed with no outline is worse than dropping the mode.
onShadowHostRemount(() => {
  if (pickerSingleton?.isActive()) pickerSingleton.exit();
  else unmountPickerOverlay();
});

// Patching the outline beats remounting: a remount tears out the hint's live region and the dimmer.
function patchPickerOutline(): void {
  const outline = pickerOverlayAnchor?.querySelector<HTMLElement>('[data-ega-picker-outline]');
  if (!outline) return;
  const rect = pickerHoverState?.rect;
  if (!rect) {
    outline.hidden = true;
    return;
  }
  outline.hidden = false;
  outline.style.left = `${rect.left}px`;
  outline.style.top = `${rect.top}px`;
  outline.style.width = `${rect.width}px`;
  outline.style.height = `${rect.height}px`;
}

let pickerRepaintPending = false;
function schedulePickerRepaint(): void {
  if (pickerRepaintPending) return;
  pickerRepaintPending = true;
  requestAnimationFrame(() => {
    pickerRepaintPending = false;
    patchPickerOutline();
  });
}

// Memoized so two enterPickerMode calls during the dynamic import cannot each build a picker and orphan the first one's listeners.
let pickerEnsureP: Promise<PickerController> | null = null;
async function ensurePicker(onPick: (r: PickResult) => void): Promise<PickerController> {
  if (pickerSingleton) return pickerSingleton;
  return (pickerEnsureP ??= (async () => {
    const { pickerMod, PickerOverlay } = await lazyPicker();
    PickerOverlayComp = PickerOverlay;
    pickerSingleton = pickerMod.createPicker({
      onPick,
      onExit: () => {
        unmountPickerOverlay();
      },
      onHover: (h) => {
        pickerHoverState = h ? { rect: h.rect } : null;
        if (!pickerOverlayAnchor) return;
        // rAF-gated: 60fps mouse moves would otherwise write the outline style on every event.
        schedulePickerRepaint();
      },
    });
    return pickerSingleton;
  })());
}

/** Leaving the picker armed after the extension context dies swallows the user's next real click. */
export function teardownPicker(): void {
  pickerSingleton?.exit();
  unmountPickerOverlay();
}

export async function enterPickerMode(
  startTranslateText: (text: string, rect: DOMRect) => void,
): Promise<void> {
  const picker = await ensurePicker((r: PickResult) => {
    startTranslateText(r.text, r.rect);
  });
  if (picker.isActive()) return;
  mountPickerOverlay();
  picker.enter();
}
