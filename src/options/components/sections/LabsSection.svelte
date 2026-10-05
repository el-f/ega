<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    s: Settings;
    onPatchAdvanced: (p: Partial<Settings['advanced']>) => Promise<void> | void;
  }
  const { s, onPatchAdvanced }: Props = $props();

  // Probe TTL stored as ms; surfaced to the slider in seconds. Range mirrors
  // settings-schema (5_000–300_000 ms / 5–300 s, step 5 s, default 30 s).
  const probeTtlSeconds = $derived(Math.round(s.advanced.backendProbeTtlMs / 1000));
</script>

<SectionCard
  title="Backend status memory"
  description="Experimental. It may change or go away in a later release."
>
  <div class="labs-row" data-ega-setting="advanced.backendProbeTtlMs">
    <p id="labs-probe-warn" class="labs-warn">
      How long Ega remembers whether a backend is reachable before checking again. Lower means more
      network requests. Higher means Ega notices later that a backend is back online.
    </p>
    <Slider
      label="Remember for"
      value={probeTtlSeconds}
      min={5}
      max={300}
      step={5}
      unit=" s"
      help="Default 30 s."
      modified={isFieldModified('advanced.backendProbeTtlMs', s)}
      describedById="labs-probe-warn"
      onchange={(v) => void onPatchAdvanced({ backendProbeTtlMs: v * 1000 })}
    />
  </div>
</SectionCard>

<style>
  .labs-row {
    padding: var(--space-3) 0;
    border-top: 1px solid var(--color-border-subtle);
  }
  .labs-row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .labs-warn {
    margin: 0 0 var(--space-2);
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
