<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import { DEFAULT_STREAMING_FLUSH_MS } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();
</script>

<SectionCard
  title="Streaming"
  description="Stream tokens as the model produces them, instead of waiting for the full result."
>
  <div data-ega-setting="display.streaming">
    <Checkbox
      id="streaming-toggle"
      label="Stream tokens live"
      checked={s.streaming}
      modified={isFieldModified('display.streaming', s)}
      onchange={(next) => void onPatch({ streaming: next })}
    />
  </div>

  <CollapsibleField open={s.streaming}>
    <div data-ega-setting="display.streamingFlushMs">
      <Slider
        label="Update every"
        value={s.streamingFlushMs ?? DEFAULT_STREAMING_FLUSH_MS}
        min={0}
        max={500}
        step={10}
        unit=" ms"
        help="How often new text appears — 0 = instant; ~50 ms is smooth; above ~100 ms streaming starts to look frozen."
        modified={isFieldModified('display.streamingFlushMs', s)}
        onchange={(v) => void onPatch({ streamingFlushMs: v })}
      />
    </div>
  </CollapsibleField>
</SectionCard>
