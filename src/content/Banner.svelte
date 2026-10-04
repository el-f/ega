<script lang="ts">
  interface Props {
    message: string;
    /** Pairs with `onaction`; absent leaves a plain notice with only Dismiss. */
    actionLabel?: string;
    onaction?: () => void;
    ondismiss?: () => void;
  }
  let { message, actionLabel, onaction, ondismiss }: Props = $props();
</script>

<div class="banner" role="region" aria-label="Ega notice">
  <div>{message}</div>
  <div class="row">
    {#if actionLabel && onaction}
      <button onclick={onaction}>{actionLabel}</button>
    {/if}
    <button class="secondary" onclick={ondismiss}>Dismiss</button>
  </div>
</div>
