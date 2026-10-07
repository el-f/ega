<script lang="ts">
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import ScrollText from '@lucide/svelte/icons/scroll-text';

  interface Props {
    onAdd: () => void;
  }

  const { onAdd }: Props = $props();
</script>

<div data-ega-rules-empty>
  <EmptyState
    title="No rules yet"
    description="For example: Keep product names in English"
    icon={ScrollText}
    ctaLabel="Add rule"
    onCta={onAdd}
  />
</div>
