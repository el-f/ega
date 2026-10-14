import { mount, unmount } from 'svelte';
import { debugCatch } from '@/shared/logger';
import { ensureShadowSheet, getContainer, onShadowHostRemount } from './shadowHost';
import type { PickResult, PickerController } from './picker';
import type { PickerBarHandle } from './picker-bar';
import type * as PickerBarMod from './picker-bar';
import type * as PickerMod from './picker';
import type PickerOverlayDefault from './PickerOverlay.svelte';

interface PickerBundle {
  pickerMod: typeof PickerMod;
  barMod: typeof PickerBarMod;
  PickerOverlay: typeof PickerOverlayDefault;
  overlayCss: string;
}
let pickerBundleP: Promise<PickerBundle> | null = null;
function lazyPicker(): Promise<PickerBundle> {
  return (pickerBundleP ??= (async () => {
    // The sheet rides the lazy chunk, so the overlay's rules cost the eager content script nothing.
    const [pickerMod, barMod, overlayMod, cssMod] = await Promise.all([
      import('./picker'),
      import('./picker-bar'),
      import('./PickerOverlay.svelte'),
      import('./picker-overlay.css?inline'),
    ]);
    return { pickerMod, barMod, PickerOverlay: overlayMod.default, overlayCss: cssMod.default };
  })());
}

let pickerOverlayHandle: ReturnType<typeof mount> | null = null;
let pickerOverlayAnchor: HTMLDivElement | null = null;
let pickerHovered: Element | null = null;
let pickerBlocked = false;
let pickerSingleton: PickerController | null = null;
let PickerOverlayComp: typeof PickerOverlayDefault | null = null;
let pickerOverlayCss = '';
let barMod: typeof PickerBarMod | null = null;
let pickerBar: PickerBarHandle | null = null;
let privateReason = '';
const PICK_STATUS = 'Click a block to translate it';

function mountPickerOverlay(): void {
  if (!PickerOverlayComp) return;
  ensureShadowSheet('ega-picker-styles', pickerOverlayCss);
  const c = getContainer();
  pickerOverlayAnchor = document.createElement('div');
  pickerOverlayAnchor.setAttribute('data-ega-picker-wrap', '');
  c.appendChild(pickerOverlayAnchor);
  pickerOverlayHandle = mount(PickerOverlayComp, { target: pickerOverlayAnchor });
  pickerBar =
    barMod?.mountPickerBar({
      kind: 'pick',
      initialStatus: PICK_STATUS,
      onCancel: () => pickerSingleton?.exit(),
    }) ?? null;
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
  pickerBar?.destroy();
  pickerBar = null;
  pickerHovered = null;
  pickerBlocked = false;
}

// exit() runs onExit -> unmountPickerOverlay; leaving the picker armed with no outline is worse than dropping the mode.
onShadowHostRemount(() => {
  if (pickerSingleton?.isActive()) pickerSingleton.exit();
  else unmountPickerOverlay();
});

// Patching the outline beats remounting: a remount tears out the bar's live region and the dimmer.
function patchPickerOutline(): void {
  const outline = pickerOverlayAnchor?.querySelector<HTMLElement>('[data-ega-picker-outline]');
  if (!outline) return;
  outline.classList.toggle('is-blocked', pickerBlocked);
  pickerBar?.set({ status: pickerBlocked ? privateReason : PICK_STATUS, blocked: pickerBlocked });
  if (!pickerHovered) {
    outline.hidden = true;
    return;
  }
  // Measured here, in the frame that writes the style, so a burst of mousemoves forces no layout.
  const rect = pickerHovered.getBoundingClientRect();
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
    const bundle = await lazyPicker();
    const { pickerMod, PickerOverlay, overlayCss } = bundle;
    PickerOverlayComp = PickerOverlay;
    pickerOverlayCss = overlayCss;
    barMod = bundle.barMod;
    privateReason = pickerMod.PRIVATE_FIELD_REASON;
    pickerSingleton = pickerMod.createPicker({
      onPick,
      onExit: () => {
        unmountPickerOverlay();
      },
      onHover: (h) => {
        pickerHovered = h?.element ?? null;
        pickerBlocked = h?.blocked === true;
        if (!pickerOverlayAnchor) return;
        // rAF-gated: 60fps mouse moves would otherwise write the outline style on every event.
        schedulePickerRepaint();
      },
      closeKeys: () => pickerBar?.closeKeys() ?? false,
      showKeys: () => pickerBar?.focusKeys(),
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
