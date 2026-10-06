<script lang="ts">
  /** The (i) toggletip: a short answer that opens on hover, focus and click. Esc or a click outside closes it. */
  import { Popover } from 'bits-ui';
  import Info from '@lucide/svelte/icons/info';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    /** Button name, "About …". */
    label: string;
    /** At most two short sentences, no links or buttons. */
    text: string;
  }

  const { label, text }: Props = $props();

  const textId = makeId('ega-infotip');
  let button = $state<HTMLButtonElement | null>(null);
  let open = $state(false);
  // A click pins it open, so moving the pointer away or tabbing on does not close what the user asked for.
  let pinned = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function later(fn: () => void, ms: number): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }

  function close(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pinned = false;
    open = false;
  }

  function onClick(): void {
    if (pinned) {
      close();
      return;
    }
    pinned = true;
    open = true;
  }

  // 300 ms, so a pointer passing over the icon does not flash the bubble.
  function onEnter(): void {
    if (!open) later(() => (open = true), 300);
    else if (timer !== null) clearTimeout(timer);
  }

  // The bubble stays while the pointer moves from the button onto it (WCAG 1.4.13).
  function onLeave(): void {
    if (pinned || document.activeElement === button) {
      if (timer !== null) clearTimeout(timer);
      return;
    }
    later(close, 150);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  }
</script>

<button
  bind:this={button}
  type="button"
  class="ega-infotip-btn"
  aria-label={label}
  aria-expanded={open}
  aria-describedby={textId}
  data-ega-infotip
  onclick={onClick}
  onfocus={() => (open = true)}
  onblur={() => {
    if (!pinned) close();
  }}
  onpointerenter={onEnter}
  onpointerleave={onLeave}
  onkeydown={onKeydown}
>
  <Info size={16} aria-hidden="true" />
</button>
<span id={textId} hidden>{text}</span>
{#if open && button}
  <Popover.Root
    open={true}
    onOpenChange={(v) => {
      if (!v) close();
    }}
  >
    <Popover.Content
      customAnchor={button}
      side="bottom"
      align="start"
      sideOffset={6}
      collisionPadding={8}
      trapFocus={false}
      class="ega-infotip"
      data-ega-infotip-text
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onInteractOutside={(e) => {
        if (button?.contains(e.target as Node)) e.preventDefault();
      }}
      onpointerenter={onEnter}
      onpointerleave={onLeave}
    >
      {text}
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  .ega-infotip-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .ega-infotip-btn:hover,
  .ega-infotip-btn[aria-expanded='true'] {
    color: var(--color-fg);
    background: var(--color-bg-hover);
  }
  .ega-infotip-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  :global(.ega-infotip) {
    max-width: min(320px, calc(100vw - var(--space-5)));
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 16px var(--color-shadow);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    font-weight: 400;
    line-height: 1.5;
    z-index: 99997;
  }
</style>
