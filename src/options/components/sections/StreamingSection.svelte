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

<SectionCard title="Streaming and cache" description="How fast answers show up.">
  <div data-ega-setting="display.streaming">
    <Checkbox
      id="streaming-toggle"
      label="Stream the answer live"
      checked={s.streaming}
      modified={isFieldModified('display.streaming', s)}
      onchange={(next) => void onPatch({ streaming: next })}
    />
    <p class="setting-help">Show the answer as the model writes it, instead of all at the end.</p>
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

  <div data-ega-setting="advanced.cacheEnabled" data-ega-cache-card>
    <Checkbox
      id="cache-enabled-toggle"
      label="Reuse recent translations"
      checked={s.cacheEnabled}
      modified={isFieldModified('advanced.cacheSettings', s)}
      onchange={(next) => void onPatch({ cacheEnabled: next })}
    />
    <p class="setting-help">
      The same text gets the same answer at once, for up to 5 minutes (500 entries). The cache lives
      in memory only, so it clears when Chrome stops Ega's background worker, for example when Ega
      is idle or the browser restarts.
    </p>
  </div>
</SectionCard>

<style>
  .setting-help {
    margin: 2px 0 0 var(--space-5);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
