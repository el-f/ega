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
    description="A rule is one extra instruction Ega adds to the prompt, such as: Keep product names in English."
    icon={ScrollText}
    ctaLabel="Add a rule"
    onCta={onAdd}
  />
</div>
