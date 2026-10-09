<script lang="ts">
  /** A settings tab in small: the box shows the stored value, and a failed write puts back what is stored. */
  import Checkbox from '@/shared/ui/Checkbox.svelte';

  interface Props {
    save: (next: boolean) => Promise<boolean>;
  }
  const { save }: Props = $props();

  let stored = $state.raw({ confidencePill: true });

  async function write(next: boolean): Promise<void> {
    stored = (await save(next)) ? { confidencePill: next } : { ...stored };
  }
</script>

<Checkbox
  label="Show confidence pill"
  checked={stored.confidencePill}
  onchange={(next) => void write(next)}
/>
