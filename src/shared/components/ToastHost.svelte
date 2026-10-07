<script lang="ts">
  import { Toaster, type ToasterProps } from 'svelte-sonner';
  import { toastStore } from '@/shared/components/toastStore';

  /** One toast look on every extension page; a surface picks only where the toasts sit. */
  type Props = Pick<ToasterProps, 'position' | 'theme' | 'offset' | 'mobileOffset'>;
  const props: Props = $props();

  const TOAST = '[data-sonner-toast]';

  let hovered = $state(false);
  let focused = $state(false);
  let host: HTMLDivElement | undefined = $state();
  // Where focus was before it entered the toasts, and the element in them that has it.
  let cameFrom: HTMLElement | null = null;
  let holder: Element | null = null;

  // A toast removed under the pointer or focus may fire no out-event; with the last one sonner drops its whole list.
  $effect(() => {
    if (!host) return;
    const el = host;
    const observer = new MutationObserver((records) => {
      const toastGone = records.some((r) =>
        [...r.removedNodes].some(
          (n) => n instanceof Element && (n.matches(TOAST) || n.querySelector(TOAST) !== null),
        ),
      );
      if (!toastGone) return;
      hovered = hovered && el.querySelector(`${TOAST}:hover`) !== null;
      focused = el.contains(document.activeElement);
      sync();
      giveFocusBack();
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  });

  /** The toast that had focus is gone and focus fell to the page: it goes back where it came from. */
  function giveFocusBack(): void {
    if (holder === null || holder.isConnected) return;
    holder = null;
    const now = document.activeElement;
    if ((now === null || now === document.body) && cameFrom?.isConnected === true) {
      cameFrom.focus({ preventScroll: true });
    }
  }

  /** The other end of the move is outside the toasts. */
  function outside(e: FocusEvent | PointerEvent): boolean {
    const other = e.relatedTarget;
    return !(other instanceof Node && (e.currentTarget as HTMLElement).contains(other));
  }

  function sync(): void {
    toastStore.hold(hovered || focused);
  }
</script>

<!-- Both events bubble, so one wrapper sees the pointer or focus on any toast. -->
<div
  bind:this={host}
  class="ega-toast-host"
  role="presentation"
  onpointerover={() => {
    hovered = true;
    sync();
  }}
  onpointerout={(e) => {
    if (!outside(e)) return;
    hovered = false;
    sync();
  }}
  onfocusin={(e) => {
    // A window switch back re-focuses the toast with no relatedTarget; the saved control stays.
    if (outside(e) && e.relatedTarget instanceof HTMLElement) cameFrom = e.relatedTarget;
    holder = e.target as Element;
    focused = true;
    sync();
  }}
  onfocusout={(e) => {
    if (!outside(e)) return;
    focused = false;
    sync();
    // Focus moved on, or the user clicked away from a toast that stays: a later removal must not pull it back.
    queueMicrotask(() => {
      if (holder?.isConnected === true && host?.contains(document.activeElement) !== true) {
        holder = null;
        cameFrom = null;
      }
    });
  }}
>
  <!-- Focus inside spreads the stack, so a Tab never lands on a back toast whose text is hidden. -->
  <Toaster
    {...props}
    expand={focused || hovered}
    closeButton
    closeButtonAriaLabel="Dismiss"
    toastOptions={{ classes: { toast: 'ega-toast-ui' } }}
  />
</div>

<style>
  .ega-toast-host {
    display: contents;
  }
  /* Sonner's colors from ega tokens, so toasts follow the active theme; the typed ones apply only with richColors. */
  .ega-toast-host :global([data-sonner-toaster]) {
    --normal-bg: var(--color-bg-elevated);
    --normal-text: var(--color-fg);
    --normal-border: var(--color-border);
    font-family: var(--font-ui);
  }
  /* [data-styled] repeats so these outrank sonner's own `[data-sonner-toast][data-styled='true'] [x]` rules. */
  .ega-toast-host :global([data-sonner-toast].ega-toast-ui[data-styled='true']) {
    max-width: min(400px, calc(100vw - var(--space-6)));
    padding: var(--space-2) var(--space-3);
    gap: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px var(--color-shadow);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    white-space: normal;
  }
  .ega-toast-host :global(.ega-toast-ui[data-styled='true'] [data-content]) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ega-toast-host :global(.ega-toast-ui[data-styled='true'] [data-title]) {
    font-weight: 400;
    line-height: var(--lh-body);
  }
  .ega-toast-host :global(.ega-toast-ui[data-styled='true'] [data-icon]) {
    margin: 0;
    color: var(--color-muted);
  }
  .ega-toast-host :global(.ega-toast-ui[data-type='success'] [data-icon]) {
    color: var(--color-success-fg);
  }
  .ega-toast-host :global(.ega-toast-ui[data-type='warning'] [data-icon]) {
    color: var(--color-warning-fg);
  }
  .ega-toast-host :global(.ega-toast-ui[data-type='error'] [data-icon]) {
    color: var(--color-danger-fg);
  }
  .ega-toast-host :global(.ega-toast-ui[data-styled='true'] [data-button][data-button]) {
    height: 28px;
    margin: 0;
    padding: 0 var(--space-2);
    background: transparent;
    color: var(--color-accent);
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .ega-toast-host :global(.ega-toast-ui[data-styled='true'] [data-button][data-button]:hover) {
    background: var(--color-accent-bg-hover);
  }
  /* Inside the toast at the inline end, not sonner's floating corner badge. */
  .ega-toast-host
    :global(.ega-toast-ui[data-styled='true'] [data-close-button][data-close-button]) {
    position: static;
    order: 1;
    transform: none;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
  }
  .ega-toast-host
    :global(.ega-toast-ui[data-styled='true'] [data-close-button][data-close-button]:hover) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .ega-toast-host
    :global(.ega-toast-ui[data-styled='true'] [data-close-button][data-close-button]:focus-visible),
  .ega-toast-host
    :global(.ega-toast-ui[data-styled='true'] [data-button][data-button]:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    box-shadow: none;
  }
</style>
