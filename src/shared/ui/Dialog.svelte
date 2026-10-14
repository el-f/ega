<script lang="ts" module>
  // Dialogs open now, and the layer the next one takes; a reset only when none is open keeps every layer above the last.
  let openDialogs = 0;
  let nextLayer = 0;
</script>

<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { id } from '@/shared/uuid';

  type Size = 'sm' | 'md' | 'lg' | 'xl';
  /** 'top' suits live-search dialogs, where the eye stays on the input. */
  type Position = 'center' | 'top';

  interface Base {
    open: boolean;
    onClose: () => void;
    children: Snippet;
    /** One-line explainer between the heading and the body. */
    help?: Snippet;
    /** Right-aligned footer row, rendered under the body. */
    actions?: Snippet;
    size?: Size;
    position?: Position;
    /** Opens with focus on the title, so a screen reader reads the title and help line before the first field. */
    focusTitle?: boolean;
    /** Selector of the control that takes focus on open (a confirm's safe button); wins over focusTitle. */
    initialFocus?: string;
    /** Id of the text that describes the dialog; the help line does when this is unset. */
    describedBy?: string;
  }

  /** One name per dialog: the heading names it, or `label` does when there is no heading. */
  type Props = Base &
    (
      | { title: string; label?: never }
      | {
          title?: never;
          label: string;
        }
    );

  let {
    open,
    label,
    onClose,
    children,
    title,
    help,
    actions,
    size = 'md',
    position = 'center',
    focusTitle = false,
    initialFocus,
    describedBy,
  }: Props = $props();

  const titleId = id('ega-dialog');
  const helpId = `${titleId}-help`;
  const panelId = `${titleId}-panel`;
  const description = $derived(describedBy ?? (help ? helpId : undefined));

  // A dialog opened over another (a confirm, a diff) paints its backdrop above it, so the one under it is covered.
  let layer = $state(0);
  $effect(() => {
    if (!open) return;
    layer = nextLayer++;
    openDialogs++;
    return () => {
      openDialogs--;
      if (openDialogs === 0) nextLayer = 0;
    };
  });

  function onOpenAutoFocus(e: Event): void {
    const target =
      initialFocus !== undefined
        ? document.getElementById(panelId)?.querySelector<HTMLElement>(initialFocus)
        : focusTitle
          ? document.getElementById(titleId)
          : null;
    if (!target) return;
    e.preventDefault();
    target.focus();
  }

  // The body is the only scroll container; a fade at an edge says more content sits past it.
  let body = $state<HTMLDivElement | null>(null);
  let content = $state<HTMLDivElement | null>(null);
  let moreAbove = $state(false);
  let moreBelow = $state(false);

  function measure(): void {
    if (body === null) return;
    moreAbove = body.scrollTop > 1;
    moreBelow = body.scrollTop + body.clientHeight < body.scrollHeight - 1;
  }

  // Content can grow while the body stays capped, so watch both boxes.
  $effect(() => {
    if (body === null || content === null) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    ro.observe(content);
    return () => ro.disconnect();
  });
</script>

{#if open}
  <button
    type="button"
    class="ega-dialog-backdrop"
    aria-label="Close dialog"
    style:--ega-dialog-layer={layer}
    onclick={onClose}
  ></button>
  <!-- Controlled: bits-ui never closes itself, so an onClose that refuses (an unsaved-draft confirm) keeps the content. -->
  <Dialog.Root
    bind:open={
      () => true,
      (v) => {
        if (!v) onClose();
      }
    }
  >
    <Dialog.Content
      id={panelId}
      class="ega-dialog size-{size} pos-{position}"
      style="--ega-dialog-layer: {layer}"
      aria-labelledby={title === undefined ? undefined : titleId}
      aria-label={title === undefined ? label : undefined}
      aria-describedby={description}
      preventScroll={false}
      interactOutsideBehavior="ignore"
      {onOpenAutoFocus}
    >
      {#if title}
        <div class="ega-dialog-head">
          <h2 id={titleId} class="ega-dialog-title" tabindex="-1">
            {title}
          </h2>
          <button type="button" class="ega-dialog-close" aria-label="Close" onclick={onClose}
            ><X size={16} strokeWidth={2} aria-hidden="true" /></button
          >
        </div>
      {/if}
      {#if help}
        <p class="ega-dialog-help" id={helpId}>{@render help()}</p>
      {/if}
      <div class="ega-dialog-scroll">
        <div class="ega-dialog-body" bind:this={body} onscroll={measure}>
          <div bind:this={content}>{@render children()}</div>
        </div>
        {#if moreAbove}
          <div class="ega-dialog-cue cue-top" aria-hidden="true"></div>
        {/if}
        {#if moreBelow}
          <div class="ega-dialog-cue cue-bottom" aria-hidden="true"></div>
        {/if}
      </div>
      {#if actions}
        <div class="ega-dialog-actions">{@render actions()}</div>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
{/if}

<style>
  .ega-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-backdrop);
    border: 0;
    padding: 0;
    cursor: pointer;
    z-index: calc(99998 + 2 * var(--ega-dialog-layer, 0));
    animation: ega-dialog-fade var(--motion-fast) var(--ease-out);
  }
  :global(.ega-dialog) {
    position: fixed;
    background: var(--color-bg);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px var(--color-shadow-strong);
    z-index: calc(99999 + 2 * var(--ega-dialog-layer, 0));
    outline: none;
    animation: ega-dialog-pop var(--motion-fast) var(--ease-out);
    max-height: calc(100vh - var(--space-8));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .ega-dialog-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-1);
    flex: 0 0 auto;
  }
  .ega-dialog-scroll {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .ega-dialog-body {
    overflow-y: auto;
    min-height: 0;
    padding: 0 var(--space-4) var(--space-4);
    /* A focused field never hides under the fade at either edge. */
    scroll-padding-block: var(--space-3);
  }
  .ega-dialog-head + .ega-dialog-scroll .ega-dialog-body,
  .ega-dialog-help + .ega-dialog-scroll .ega-dialog-body {
    padding-top: var(--space-2);
  }
  .ega-dialog-scroll:first-child .ega-dialog-body {
    padding-top: var(--space-4);
  }
  .ega-dialog-cue {
    position: absolute;
    inset-inline: 0;
    height: var(--space-3);
    pointer-events: none;
  }
  .cue-top {
    top: 0;
    background: linear-gradient(var(--color-shadow), transparent);
  }
  .cue-bottom {
    bottom: 0;
    background: linear-gradient(transparent, var(--color-shadow));
  }
  /* A surface can set a smaller title size in its own sheet (options: 14px, spec 1.1). */
  .ega-dialog-title {
    margin: 0;
    font-size: var(--ega-dialog-title-fs, var(--fs-lg));
    font-weight: 600;
    color: var(--color-fg);
  }
  .ega-dialog-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--color-muted);
    line-height: 1;
    cursor: pointer;
    padding: var(--space-1);
    flex: 0 0 auto;
  }
  .ega-dialog-close:hover,
  .ega-dialog-close:focus-visible {
    color: var(--color-fg);
  }
  .ega-dialog-help {
    margin: 0;
    padding: 0 var(--space-4) var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    flex: 0 0 auto;
  }
  .ega-dialog-help:first-child {
    padding-top: var(--space-4);
  }
  /* Solid and outside the scroll container, so it never covers the last row. */
  .ega-dialog-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: flex-end;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg);
    flex: 0 0 auto;
  }
  :global(.ega-dialog.pos-center) {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  :global(.ega-dialog.pos-top) {
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    max-height: calc(100vh - 80px - var(--space-6));
  }
  :global(.ega-dialog.size-sm) {
    width: min(400px, calc(100vw - var(--space-6)));
  }
  :global(.ega-dialog.size-md) {
    width: min(560px, calc(100vw - var(--space-6)));
  }
  :global(.ega-dialog.size-lg) {
    width: min(720px, calc(100vw - var(--space-6)));
  }
  :global(.ega-dialog.size-xl) {
    width: min(1120px, 96vw);
  }
  @keyframes -global-ega-dialog-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes -global-ega-dialog-pop {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  /* Local copy of the reduced-motion rule for surfaces that do not import tokens.css. */
  @media (prefers-reduced-motion: reduce) {
    :global(.ega-dialog),
    .ega-dialog-backdrop {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
