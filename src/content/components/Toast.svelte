<script lang="ts">
  interface Props {
    message: string;
    /** Pairs with `onaction`. Absent = a plain notice with nothing to click. */
    actionLabel?: string;
    onaction?: () => void;
  }
  let { message, actionLabel, onaction }: Props = $props();
</script>

<div class="ega-toast" role="status" aria-live="polite">
  {message}
  {#if actionLabel && onaction}
    <button type="button" class="ega-toast-action" data-ega-toast-action onclick={onaction}
      >{actionLabel}</button
    >
  {/if}
</div>
