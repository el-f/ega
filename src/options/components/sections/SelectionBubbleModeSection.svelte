<script lang="ts">
  import type { Settings } from '@/shared/types';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
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
</SectionCard>
