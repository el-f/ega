<script lang="ts">
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
</script>

<div data-ega-rules-empty>
  <EmptyState
    title="No rules yet"
    description="Use Add a rule below to write one."
    icon={ScrollText}
  />
</div>
