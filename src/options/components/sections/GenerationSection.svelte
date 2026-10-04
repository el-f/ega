<script lang="ts">
  import type { Settings } from '@/shared/types';
  import type { TaskEffort } from '@/shared/settings-schema';
  import { isFieldModified } from '@/shared/settings-registry';
  import { clampEffort, type SamplingSupport } from '@/shared/backends/sampling-caps';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import EffortSegmented, { EFFORT_LABEL } from '@/options/components/EffortSegmented.svelte';

  interface Props {
    s: Settings;
    /** Resolved sampling support for the active (backend, model) pair —
     *  computed by the parent and made reactive there. */
    caps: SamplingSupport;
    /** The backend that answers first and the model it runs, for the line that says what Effort does there. */
    activeBackend: string;
    activeModel: string;
    onSetGlobalTemperature: (v: number) => Promise<void>;
    onSetGlobalMaxTokens: (v: number) => Promise<void>;
    onSetGlobalEffort: (v: TaskEffort) => Promise<void>;
  }

  const {
    s,
    caps,
    activeBackend,
    activeModel,
    onSetGlobalTemperature,
    onSetGlobalMaxTokens,
    onSetGlobalEffort,
  }: Props = $props();

  const DEF = DEFAULT_SETTINGS;

  // The thumb follows the drag locally; each write rewrites the whole settings row, so it waits for release.
  let maxTokensDrag = $state<number | null>(null);
  let temperatureDrag = $state<number | null>(null);
  // A stored change wins: Reset, an import, or the snap bits-ui reports for a value off the step grid, which never commits.
  $effect(() => {
    void s.advanced.maxTokens;
    maxTokensDrag = null;
  });
  $effect(() => {
    void s.advanced.temperature;
    temperatureDrag = null;
  });

  // maxTokens is off only on native, so it tells a CLI apart from a model that rejects temperature.
  const tempDisabledReason = $derived(
    caps.temperature
      ? null
      : !caps.maxTokens
        ? 'Native CLI manages its own sampling.'
        : caps.efforts.length > 0
          ? 'This model does not take temperature. Use Effort.'
          : 'This model does not take temperature.',
  );
  // On native both sliders are off for one reason, so it is said once, under Temperature.
  const nativeSampling = $derived(!caps.maxTokens);

  // What the chosen level does on the backend that runs first; the setting itself applies to every backend.
  const effortNote = $derived.by(() => {
    if (activeBackend === 'native') return 'The native CLI always runs at Low effort.';
    const model = activeModel || 'This model';
    if (caps.efforts.length === 0)
      return `${model} has no effort setting, so Effort does not change it.`;
    const runs = clampEffort(s.advanced.effort, caps.efforts);
    return runs !== null && runs !== s.advanced.effort
      ? `${model} has no ${EFFORT_LABEL[s.advanced.effort]} level, so it runs at ${EFFORT_LABEL[runs]}.`
      : null;
  });

  const genModified = $derived(
    isFieldModified('advanced.temperature', s) ||
      isFieldModified('advanced.maxTokens', s) ||
      isFieldModified('advanced.effort', s),
  );
  async function resetGeneration(): Promise<void> {
    await onSetGlobalTemperature(DEF.advanced.temperature);
    await onSetGlobalMaxTokens(DEF.advanced.maxTokens);
    await onSetGlobalEffort(DEF.advanced.effort);
  }
</script>

<div class="generation-pane-root">
  <div data-ega-generation-card>
    <SectionCard title="Generation" description="Effort, answer length and temperature.">
      {#snippet headerActions()}
        <SectionReset
          modified={genModified}
          onReset={resetGeneration}
          ariaLabel="Reset Generation section to defaults"
        />
      {/snippet}
      <div data-ega-setting="advanced.effort" class="effort-block">
        <span class="effort-label" id="gen-effort-label">Effort</span>
        <EffortSegmented
          value={s.advanced.effort}
          ariaLabel="Effort"
          onchange={(v) => void onSetGlobalEffort(v)}
        />
        <p class="effort-help">
          How much a model thinks before it answers. Higher is slower and costs more. Explain and
          Ask start at Low; give any task its own Effort on the Tasks tab.
        </p>
        {#if effortNote}
          <p class="effort-help" data-ega-effort-note>{effortNote}</p>
        {/if}
      </div>

      <div data-ega-setting="advanced.maxTokens">
        <Slider
          label="Max answer length (tokens)"
          value={maxTokensDrag ?? s.advanced.maxTokens}
          min={16}
          max={8192}
          step={16}
          help={`Room for the answer. A thinking model gets extra room on top when it runs above Off. Default ${DEF.advanced.maxTokens}. Below 256 tokens, long answers can get cut short.`}
          modified={isFieldModified('advanced.maxTokens', s)}
          disabled={nativeSampling}
          {...nativeSampling
            ? { describedById: 'gen-temp-disabled' }
            : {
                onReset: () => void onSetGlobalMaxTokens(DEF.advanced.maxTokens),
                resetAriaLabel: 'Reset max answer length',
                resetInheritedLabel: `Default ${DEF.advanced.maxTokens}`,
              }}
          onchange={(v) => (maxTokensDrag = v)}
          oncommit={(v) => {
            maxTokensDrag = null;
            void onSetGlobalMaxTokens(v);
          }}
        />
      </div>

      <div data-ega-setting="advanced.temperature">
        <Slider
          label="Temperature"
          value={temperatureDrag ?? s.advanced.temperature}
          min={0}
          max={2}
          step={0.05}
          help={`0 = most predictable, 2 = most varied. Default ${DEF.advanced.temperature}. Above ~1.2 answers can come back broken; 0 may loop on some backends.`}
          modified={isFieldModified('advanced.temperature', s)}
          disabled={tempDisabledReason !== null}
          {...tempDisabledReason !== null
            ? { describedById: 'gen-temp-disabled' }
            : {
                onReset: () => void onSetGlobalTemperature(DEF.advanced.temperature),
                resetAriaLabel: 'Reset temperature',
                resetInheritedLabel: `Default ${DEF.advanced.temperature}`,
              }}
          onchange={(v) => (temperatureDrag = v)}
          oncommit={(v) => {
            temperatureDrag = null;
            void onSetGlobalTemperature(v);
          }}
        />
        {#if tempDisabledReason !== null}
          <p id="gen-temp-disabled" class="disabled-reason" data-ega-disabled-reason>
            {nativeSampling
              ? 'Native CLI manages its own sampling, so answer length and temperature do not apply.'
              : tempDisabledReason}
          </p>
        {/if}
      </div>
    </SectionCard>
  </div>
</div>

<style>
  .generation-pane-root {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .disabled-reason {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .effort-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: var(--space-3) 0;
  }
  .effort-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .effort-help {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
