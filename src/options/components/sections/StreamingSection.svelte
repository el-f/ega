<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified, settingHint } from '@/shared/settings-registry';
  import { DEFAULT_STREAMING_FLUSH_MS } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import SettingHint from '@/options/components/SettingHint.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }

  const { s, onPatch }: Props = $props();
</script>

<SectionCard
  title="Streaming and cache"
  description="How fast answers show up"
  info={{
    label: 'About the cache',
    text: "Ega keeps up to 500 recent answers for 5 minutes. They live in memory, so they clear when Chrome stops Ega's background worker.",
  }}
>
  <div data-ega-setting="display.streaming">
    <Checkbox
      id="streaming-toggle"
      label="Stream the answer live"
      checked={s.streaming}
      describedBy="streaming-hint"
      modified={isFieldModified('display.streaming', s)}
      onchange={(next) => void onPatch({ streaming: next })}
    />
    <SettingHint setting="display.streaming" id="streaming-hint" indent />
  </div>
  <!-- Stays on screen while streaming is off, so a search jump finds it and the line says why it does nothing. -->
  <div class="indent" data-ega-setting="display.streamingFlushMs">
    <Slider
      label="Show new text every"
      value={s.streamingFlushMs ?? DEFAULT_STREAMING_FLUSH_MS}
      min={0}
      max={500}
      step={10}
      unit=" ms"
      defaultValue={DEFAULT_STREAMING_FLUSH_MS}
      help={settingHint('display.streamingFlushMs')}
      modified={isFieldModified('display.streamingFlushMs', s)}
      disabled={!s.streaming}
      disabledReason="Used only while streaming is on"
      onchange={(v) => void onPatch({ streamingFlushMs: v })}
    />
  </div>
  <div data-ega-setting="advanced.cacheEnabled" data-ega-cache-card>
    <Checkbox
      id="cache-enabled-toggle"
      label="Reuse recent answers"
      checked={s.cacheEnabled}
      describedBy="cache-hint"
      modified={isFieldModified('advanced.cacheSettings', s)}
      onchange={(next) => void onPatch({ cacheEnabled: next })}
    />
    <SettingHint setting="advanced.cacheSettings" id="cache-hint" indent />
  </div>
</SectionCard>

<style>
  .indent {
    padding-inline-start: calc(16px + var(--space-2));
  }
</style>
