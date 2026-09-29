<script lang="ts">
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import ScrollText from '@lucide/svelte/icons/scroll-text';

  interface Props {
    onJumpToRecipes?: (() => void) | undefined;
  }

  const { onJumpToRecipes }: Props = $props();
</script>

<div data-ega-rules-empty>
  {#if onJumpToRecipes}
    <EmptyState
      title="No rules yet"
      description="Tell Ega what to do differently above, or start from a bundled recipe."
      icon={ScrollText}
      ctaLabel="Pick a recipe"
      onCta={onJumpToRecipes}
    />
  {:else}
    <EmptyState
      title="No rules yet"
      description="Tell Ega what to do differently above, or open Add rule manually for the full form."
      icon={ScrollText}
    />
  {/if}
</div>
