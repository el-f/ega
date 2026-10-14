<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import { DEFAULT_SMART_BUBBLE_MIN_LENGTH } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import InfinityIcon from '@lucide/svelte/icons/infinity';
  import EyeOff from '@lucide/svelte/icons/eye-off';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<unknown> | void;
  }
  const { s, onPatch }: Props = $props();

  // The thumb follows the drag; the released value stays until its write settles.
  let lengthDrag = $state<number | null>(null);
</script>

<SectionCard
  title="Selection bubble"
  description="When the floating bubble appears after you select text"
  info={{
    label: 'About Smart',
    text: 'Smart hides the bubble on short selections and on text that reads as English. Scripts other than Latin need only two letters.',
  }}
>
  <RadioGroup
    name="bubbleMode"
    value={s.bubbleMode}
    dataAttrs={{ 'data-ega-bubble-mode': true, 'aria-label': 'Selection bubble' }}
    options={[
      {
        value: 'smart',
        label: 'Smart',
        icon: Sparkles,
        description: 'Shows it on longer text that is not in English',
      },
      {
        value: 'always',
        label: 'Always',
        icon: InfinityIcon,
        description: 'Shows it on every selection',
      },
      {
        value: 'never',
        label: 'Never',
        icon: EyeOff,
        description: 'Use the shortcut or the right-click menu instead',
      },
    ]}
    onValueChange={(next) => void onPatch({ bubbleMode: next as Settings['bubbleMode'] })}
  >
    {#snippet after(value)}
      {#if value === 'smart' && s.bubbleMode === 'smart'}
        <div class="smart-length" data-ega-setting="advanced.smartBubbleMinLength">
          <Slider
            label="Shortest selection"
            value={lengthDrag ?? s.smartBubbleMinLength ?? DEFAULT_SMART_BUBBLE_MIN_LENGTH}
            min={3}
            max={15}
            step={1}
            formatValue={(v) => `${v} letters`}
            defaultValue={DEFAULT_SMART_BUBBLE_MIN_LENGTH}
            modified={isFieldModified('advanced.smartBubbleMinLength', s)}
            onchange={(v) => (lengthDrag = v)}
            oncommit={(v) => {
              lengthDrag = v;
              void Promise.resolve(onPatch({ smartBubbleMinLength: v })).finally(() => {
                if (lengthDrag === v) lengthDrag = null;
              });
            }}
          />
        </div>
      {/if}
    {/snippet}
  </RadioGroup>
</SectionCard>

<style>
  /* Lines the slider up with the Smart label: the row padding, the radio dot, then the gap. */
  .smart-length {
    padding-inline-start: calc(var(--space-2) + 16px + var(--space-2));
    margin-block: var(--space-1) var(--space-3);
  }
</style>
