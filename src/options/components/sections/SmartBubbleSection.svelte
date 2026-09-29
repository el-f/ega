<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import { DEFAULT_SMART_BUBBLE_MIN_LENGTH } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();
</script>

{#if s.bubbleMode === 'smart'}
  <SectionCard
    title="Smart mode"
    description="Smart mode hides the bubble on selections shorter than this."
  >
    <div data-ega-setting="advanced.smartBubbleMinLength">
      <Slider
        label="Smart bubble — min selection length"
        value={s.smartBubbleMinLength ?? DEFAULT_SMART_BUBBLE_MIN_LENGTH}
        min={3}
        max={15}
        step={1}
        unit=" chars"
        help="Below this length, smart mode hides the bubble even on non-English text."
        modified={isFieldModified('advanced.smartBubbleMinLength', s)}
        onchange={(v) => void onPatch({ smartBubbleMinLength: v })}
      />
    </div>
  </SectionCard>
{/if}
