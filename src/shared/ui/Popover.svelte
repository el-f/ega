<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Popover } from 'bits-ui';
  import IconButton from './IconButton.svelte';
  import X from '@lucide/svelte/icons/x';

  type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

  interface Props {
    open: boolean;
    /** A null anchor skips render, so the popover never mounts unpositioned. */
    anchor: HTMLElement | null | undefined;
    onClose: () => void;
    children: Snippet;
    placement?: Placement;
    title?: string;
    /** Dim the surface behind the popover. Clicking the dim closes it. */
    scrim?: boolean;
  }

  let {
    open,
    anchor,
    onClose,
    children,
    placement = 'bottom-start',
    title,
    scrim = false,
  }: Props = $props();

  const side = $derived(placement.startsWith('bottom') ? 'bottom' : 'top');
  const align = $derived(placement.endsWith('start') ? 'start' : 'end');

  let priorFocus: Element | null = null;
  let contentEl = $state<HTMLElement | null>(null);

  function rememberFocus(e: Event): void {
    priorFocus = document.activeElement;
    // Focus the panel itself: bits-ui would take the close X, whose tooltip then pops open on open.
    e.preventDefault();
    requestAnimationFrame(() => contentEl?.focus({ preventScroll: true }));
  }

  // Non-modal: focus leaving closes it, or Tab would move under it. The anchor counts as inside: a menu that opened it hands focus back there.
  function closeOnFocusOut(e: FocusEvent): void {
    if (scrim) return;
    if (e.target instanceof Node && anchor?.contains(e.target)) return;
    onClose();
  }

  function restoreFocus(e: Event): void {
    // preventScroll: closing must not scroll-jump the page back to the trigger.
    const target = priorFocus as { focus?: (opts?: { preventScroll: boolean }) => void } | null;
    priorFocus = null;
    // A click outside already moved focus somewhere on purpose (the message box); leave it there.
    const now = document.activeElement;
    if (now && now !== document.body && now !== target && !contentEl?.contains(now)) {
      e.preventDefault();
      return;
    }
    if (target && typeof target.focus === 'function') {
      e.preventDefault();
      try {
        target.focus({ preventScroll: true });
      } catch {
        // ignore — element may no longer be in the DOM
      }
    }
  }
</script>

{#if open && anchor && scrim}
  <button type="button" class="ega-popover-scrim" aria-label="Dismiss" onclick={onClose}></button>
{/if}
{#if open && anchor}
  <Popover.Root
    open={true}
    onOpenChange={(v) => {
      if (!v) onClose();
    }}
  >
    <Popover.Content
      bind:ref={contentEl}
      customAnchor={anchor}
      {side}
      {align}
      sideOffset={6}
      collisionPadding={4}
      class="ega-popover"
      role="dialog"
      aria-label={title}
      onOpenAutoFocus={rememberFocus}
      onCloseAutoFocus={restoreFocus}
      onFocusOutside={closeOnFocusOut}
      trapFocus={scrim}
    >
      <div class="ega-popover-head">
        {#if title}<span class="ega-popover-title">{title}</span>{:else}<span></span>{/if}
        <IconButton icon={X} ariaLabel="Close" size="sm" onclick={onClose} />
      </div>
      <div class="ega-popover-body">
        {@render children()}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  :global(.ega-popover) {
    background: var(--color-bg);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 16px var(--color-shadow);
    padding: var(--space-2);
    z-index: 99997;
    min-width: 160px;
    outline: none;
    animation: ega-popover-in var(--motion-fast) var(--ease-out);
  }
  .ega-popover-scrim {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: var(--color-overlay, rgba(0, 0, 0, 0.16));
    /* Soft blur only — the popover is non-modal, the form behind it must stay readable. */
    backdrop-filter: blur(1px);
    border: 0;
    padding: 0;
    margin: 0;
    cursor: default;
    z-index: 99996;
    animation: ega-popover-in var(--motion-fast) var(--ease-out);
  }
  /* The popup chrome is only 360px wide — a viewport-wide dim would darken blank space. */
  :global(body[data-ega-popup]) .ega-popover-scrim {
    width: var(--ega-popup-width, 360px);
    background: rgba(0, 0, 0, 0.32);
  }
  .ega-popover-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-1)) var(--space-1);
  }
  .ega-popover-title {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
    padding-left: var(--space-1);
  }
  .ega-popover-body {
    display: block;
  }
  @keyframes -global-ega-popover-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.ega-popover) {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
