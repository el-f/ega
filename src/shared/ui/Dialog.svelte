<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
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
  }: Props = $props();

  const titleId = id('ega-dialog');
</script>

{#if open}
  <button type="button" class="ega-dialog-backdrop" aria-label="Close dialog" onclick={onClose}
  ></button>
  <Dialog.Root
    open={true}
    onOpenChange={(v) => {
      if (!v) onClose();
    }}
  >
    <Dialog.Content
      class="ega-dialog size-{size} pos-{position}"
      aria-labelledby={title === undefined ? undefined : titleId}
      aria-label={title === undefined ? label : undefined}
      preventScroll={false}
    >
      {#if title}
        <div class="ega-dialog-head">
          <h2 id={titleId} class="ega-dialog-title">{title}</h2>
          <button type="button" class="ega-dialog-close" aria-label="Close" onclick={onClose}
            >×</button
          >
        </div>
      {/if}
      {#if help}
        <p class="ega-dialog-help">{@render help()}</p>
      {/if}
      {@render children()}
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
    z-index: 99998;
    animation: ega-dialog-fade var(--motion-fast) var(--ease-out);
  }
  :global(.ega-dialog) {
    position: fixed;
    background: var(--color-bg);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px var(--color-shadow-strong);
    padding: var(--space-4);
    z-index: 99999;
    outline: none;
    animation: ega-dialog-pop var(--motion-fast) var(--ease-out);
    max-height: 90vh;
    overflow-y: auto;
  }
  .ega-dialog-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .ega-dialog-title {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: 600;
    color: var(--color-fg);
  }
  .ega-dialog-close {
    background: transparent;
    border: 0;
    color: var(--color-muted);
    font-size: var(--fs-xl);
    line-height: 1;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    flex: 0 0 auto;
  }
  .ega-dialog-close:hover,
  .ega-dialog-close:focus-visible {
    color: var(--color-fg);
  }
  .ega-dialog-help {
    margin: 0 0 var(--space-3);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  /* Pull back under the head's own bottom margin; a help line on its own keeps the padding. */
  .ega-dialog-head + .ega-dialog-help {
    margin-top: calc(-1 * var(--space-2));
  }
  .ega-dialog-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-4);
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
  }
  :global(.ega-dialog.size-sm) {
    width: min(400px, 92vw);
  }
  :global(.ega-dialog.size-md) {
    width: min(560px, 92vw);
  }
  :global(.ega-dialog.size-lg) {
    width: min(720px, 92vw);
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
