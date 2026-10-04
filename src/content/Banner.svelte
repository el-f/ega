<script lang="ts">
  interface Props {
    message: string;
    ondismiss?: () => void;
  }
  let { message, ondismiss }: Props = $props();
</script>

<div class="banner" role="region" aria-label="Ega notice">
  <div>{message}</div>
  <div class="row">
    <button class="secondary" onclick={ondismiss}>Dismiss</button>
  </div>
</div>
