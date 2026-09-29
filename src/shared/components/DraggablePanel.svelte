<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Viewport-anchored anchor in px; the panel adds any drag offset itself. */
    left: number;
    top: number;
    /** Render the left-border drag gutter. Offset resets on every mount. */
    draggable?: boolean;
    /** Dismiss on a mousedown outside the panel. */
    clickOutsideDismiss?: boolean;
    /** Optional aria-label for assistive tech. Defaults to "Panel". */
    ariaLabel?: string;
    /** Optional class appended to the root so consumers can style. */
    class?: string;
    /** Extra inline style appended after the computed transform. */
    style?: string;
    /** Called on Escape keydown OR (when enabled) click outside. */
    onClose: () => void;
    /** Content rendered inside the panel. */
    children: Snippet;
  }

  let {
    left,
    top,
    draggable = false,
    clickOutsideDismiss = false,
    ariaLabel = 'Panel',
    class: extraClass = '',
    style: extraStyle = '',
    onClose,
    children,
  }: Props = $props();

  let dragOffset = $state({ x: 0, y: 0 });
  let dragging = $state(false);
  let dragStart = { ox: 0, oy: 0, mx: 0, my: 0 };
  let rootEl: HTMLDivElement | undefined = $state(undefined);
  let priorFocus: Element | null = null;

  function onGutterPointerDown(e: PointerEvent): void {
    if (!draggable) return;
    dragging = true;
    dragStart = { ox: dragOffset.x, oy: dragOffset.y, mx: e.clientX, my: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (e) {
      debugCatch(e, 'shared.components.DraggablePanel.1');
    }
    e.preventDefault();
  }

  function onGutterPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    dragOffset = {
      x: dragStart.ox + (e.clientX - dragStart.mx),
      y: dragStart.oy + (e.clientY - dragStart.my),
    };
  }

  function onGutterPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (e) {
      debugCatch(e, 'shared.components.DraggablePanel.2');
    }
  }

  $effect(() => {
    if (!rootEl) return;
    const el = rootEl;
    priorFocus = document.activeElement;
    el.focus({ preventScroll: true });
    return () => {
      const target = priorFocus as { focus?: () => void } | null;
      if (target && typeof target.focus === 'function') {
        try {
          target.focus();
        } catch (e) {
          debugCatch(e, 'shared.components.DraggablePanel.focusRestore');
        }
      }
    };
  });

  // `rootEl.contains(target)` alone misses a shadow-root retarget; composedPath sees across the boundary.
  $effect(() => {
    if (!clickOutsideDismiss) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!rootEl) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      const r = rootEl.getRootNode();
      const shadowHost = r instanceof ShadowRoot ? r.host : null;
      const inside =
        (shadowHost !== null && (target === shadowHost || shadowHost.contains(target))) ||
        rootEl.contains(target) ||
        e.composedPath().includes(rootEl) ||
        (shadowHost !== null && e.composedPath().includes(shadowHost));
      if (!inside) {
        // Clicking into a field means the user is typing, not navigating away.
        if (e.target instanceof HTMLElement) {
          const tag = (e.target as HTMLElement).tagName;
          if (
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            (e.target as HTMLElement).isContentEditable
          ) {
            return;
          }
        }
        onClose();
      }
    };
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  });

  const NUDGE_PX = 16;

  function onGutterKeyDown(e: KeyboardEvent): void {
    if (!draggable) return;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -NUDGE_PX;
    else if (e.key === 'ArrowRight') dx = NUDGE_PX;
    else if (e.key === 'ArrowUp') dy = -NUDGE_PX;
    else if (e.key === 'ArrowDown') dy = NUDGE_PX;
    else return;
    e.preventDefault();
    dragOffset = { x: dragOffset.x + dx, y: dragOffset.y + dy };
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Esc mid-drag cancels the drag instead of closing the panel.
      if (dragging) {
        dragging = false;
        dragOffset = { x: dragStart.ox, y: dragStart.oy };
        return;
      }
      onClose();
    }
  }

  const computedStyle = $derived(
    `left: ${left + dragOffset.x}px; top: ${top + dragOffset.y}px;` +
      (extraStyle ? ' ' + extraStyle : ''),
  );
</script>

<!-- shadow-css-lint-allow: ega-draggable-panel — a naming hook with no rule; every consumer styles the panel through `extraClass`. -->
<div
  bind:this={rootEl}
  class="ega-draggable-panel {extraClass}"
  class:is-draggable={draggable}
  class:is-dragging={dragging}
  style={computedStyle}
  role="dialog"
  aria-label={ariaLabel}
  tabindex="-1"
  onkeydown={onKeyDown}
>
  {#if draggable}
    <!-- The gutter is the only surface that starts a drag; the rest of the panel stays clickable. -->
    <button
      type="button"
      class="ega-drag-gutter"
      aria-label="Drag to move, or move with arrow keys"
      onpointerdown={onGutterPointerDown}
      onpointermove={onGutterPointerMove}
      onpointerup={onGutterPointerUp}
      onpointercancel={onGutterPointerUp}
      onkeydown={onGutterKeyDown}
    >
      <span class="ega-drag-gutter-dot" aria-hidden="true"></span>
      <span class="ega-drag-gutter-dot" aria-hidden="true"></span>
      <span class="ega-drag-gutter-dot" aria-hidden="true"></span>
    </button>
  {/if}
  {@render children()}
</div>
