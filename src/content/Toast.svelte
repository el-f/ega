<script lang="ts">
  import { toastLifetimeMs, type ToastKind } from '@/shared/toast-policy';

  interface Props {
    message: string;
    kind?: ToastKind;
    /** Pairs with `onaction`. Absent = a notice with nothing to click. */
    actionLabel?: string;
    onaction?: () => void;
    ondismiss: () => void;
  }
  let { message, kind = 'info', actionLabel, onaction, ondismiss }: Props = $props();

  const hasAction = $derived(actionLabel !== undefined && onaction !== undefined);
  const lifetimeMs = $derived(
    toastLifetimeMs(
      kind,
      hasAction && actionLabel !== undefined ? { label: actionLabel } : undefined,
    ),
  );
  let hovered = $state(false);
  let focused = $state(false);

  // A timed toast waits while the pointer or focus is on it, then starts over.
  $effect(() => {
    const ms = lifetimeMs;
    const waiting = hovered || focused;
    if (ms === null || waiting) return;
    const t = setTimeout(ondismiss, ms);
    return () => clearTimeout(t);
  });

  function leaving(e: FocusEvent | PointerEvent): boolean {
    const to = e.relatedTarget;
    return !(to instanceof Node && (e.currentTarget as HTMLElement).contains(to));
  }
</script>

<!-- Lucide glyph paths inline: the icon package would cost the eager content script far more. -->
<div
  class="ega-toast"
  data-kind={kind}
  role={kind === 'warning' || kind === 'error' ? 'alert' : 'status'}
  onpointerover={() => (hovered = true)}
  onpointerout={(e) => {
    if (leaving(e)) hovered = false;
  }}
  onfocusin={() => (focused = true)}
  onfocusout={(e) => {
    if (leaving(e)) focused = false;
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && !e.isComposing) {
      e.stopPropagation();
      ondismiss();
    }
  }}
>
  <svg class="ega-toast-icon" viewBox="0 0 24 24" aria-hidden="true">
    {#if kind === 'success'}
      <path d="M20 6 9 17l-5-5" />
    {:else if kind === 'warning'}
      <path
        d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"
      />
    {:else}
      <circle cx="12" cy="12" r="10" />
      <path d={kind === 'error' ? 'M12 8v4m0 4h.01' : 'M12 16v-4m0-4h.01'} />
    {/if}
  </svg>
  <span class="ega-toast-text">{message}</span>
  {#if hasAction}
    <button type="button" class="ega-toast-action" data-ega-toast-action onclick={onaction}
      >{actionLabel}</button
    >
  {/if}
  <button
    type="button"
    class="ega-toast-close"
    aria-label="Dismiss"
    data-ega-toast-close
    onclick={ondismiss}
  >
    <svg class="ega-toast-icon" viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M18 6 6 18M6 6l12 12" /></svg
    >
  </button>
</div>
