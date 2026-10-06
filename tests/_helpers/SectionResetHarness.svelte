<script lang="ts">
  /** A card whose reset clears its own "changed" state, as a settings write does. */
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';

  let modified = $state(true);
</script>

<SectionCard title="Where answers show">
  {#snippet headerActions()}
    <SectionReset
      {modified}
      onReset={async () => {
        modified = false;
      }}
    />
  {/snippet}
  <p>Body</p>
</SectionCard>
