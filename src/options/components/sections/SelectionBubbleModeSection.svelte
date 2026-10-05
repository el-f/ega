<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import { DEFAULT_SMART_BUBBLE_MIN_LENGTH } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import InfinityIcon from '@lucide/svelte/icons/infinity';
  import EyeOff from '@lucide/svelte/icons/eye-off';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();
</script>

<SectionCard
  title="Selection bubble"
  description="When the floating bubble appears after you select text."
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
        description:
          'Hides the bubble on short selections and on text that reads as English; shows it on longer non-English text or transliterations.',
      },
      {
        value: 'always',
        label: 'Always',
        icon: InfinityIcon,
        description: 'Shows the bubble on every selection.',
      },
      {
        value: 'never',
        label: 'Never',
        icon: EyeOff,
        description: 'Hides the bubble. The keyboard shortcut and the right-click menu still work.',
      },
    ]}
    onValueChange={(next) => void onPatch({ bubbleMode: next as Settings['bubbleMode'] })}
  />

  <CollapsibleField open={s.bubbleMode === 'smart'}>
    <div data-ega-setting="advanced.smartBubbleMinLength">
      <Slider
        label="Minimum selection length"
        value={s.smartBubbleMinLength ?? DEFAULT_SMART_BUBBLE_MIN_LENGTH}
        min={3}
        max={15}
        step={1}
        unit=" chars"
        help="Smart mode hides the bubble on shorter selections, even on non-English text."
        modified={isFieldModified('advanced.smartBubbleMinLength', s)}
        onchange={(v) => void onPatch({ smartBubbleMinLength: v })}
      />
    </div>
  </CollapsibleField>
</SectionCard>
