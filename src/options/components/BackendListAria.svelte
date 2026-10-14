<script lang="ts">
  interface Props {
    message?: string;
  }

  let { message = '' }: Props = $props();
</script>

<div role="status" aria-live="polite" class="ega-sr-only">{message}</div>
