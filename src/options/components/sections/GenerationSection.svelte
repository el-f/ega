<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { EFFORT_LEVELS, type TaskEffort } from '@/shared/settings-schema';
  import { isFieldModified, settingHint } from '@/shared/settings-registry';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import Segmented from '@/shared/ui/Segmented.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import SettingHint from '@/options/components/SettingHint.svelte';
  import { EFFORT_LABEL } from '@/options/effort-labels';
  import type { GenerationNotes } from '@/options/generation-notes';

  interface Props {
    s: Settings;
    /** Note lines for the backends Ega will try that ignore or change a value. */
    notes: GenerationNotes;
    onSetGlobalTemperature: (v: number) => Promise<void>;
    onSetGlobalMaxTokens: (v: number) => Promise<void>;
    onSetGlobalEffort: (v: TaskEffort) => Promise<void>;
    onResetCard: (title: string, defaults: Partial<Settings>) => Promise<void>;
  }

  const {
    s,
    notes,
    onSetGlobalTemperature,
    onSetGlobalMaxTokens,
    onSetGlobalEffort,
    onResetCard,
  }: Props = $props();

  const DEF = DEFAULT_SETTINGS;
  const TITLE = 'Generation';

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

  const genModified = $derived(
    isFieldModified('advanced.temperature', s) ||
      isFieldModified('advanced.maxTokens', s) ||
      isFieldModified('advanced.effort', s),
  );
  function reset(): Promise<void> {
    return onResetCard(TITLE, {
      advanced: {
        temperature: DEF.advanced.temperature,
        maxTokens: DEF.advanced.maxTokens,
        effort: DEF.advanced.effort,
      } as Settings['advanced'],
    });
  }

  const tokens = (v: number): string => `${v.toLocaleString('en-US')} tokens`;
</script>

{#snippet noteLines(lines: readonly string[], kind: string)}
  {#each lines as line (line)}
    <p class="gen-note" data-ega-generation-note={kind}>{line}</p>
  {/each}
{/snippet}

<div data-ega-generation-card>
  <SectionCard
    title={TITLE}
    description="Effort, answer length and creativity for every task"
    info={{
      label: 'About generation',
      text: 'Each task can set its own Effort on the Tasks tab. A thinking model gets extra room on top of the longest answer when Effort is above Off.',
    }}
  >
    {#snippet headerActions()}
      <SectionReset modified={genModified} onReset={reset} />
    {/snippet}

    <div data-ega-setting="advanced.effort" class="effort-block">
      <span class="effort-label" id="gen-effort-label">
        Effort
        {#if isFieldModified('advanced.effort', s)}<span class="changed" data-ega-modified="true"
            >Changed</span
          >{/if}
      </span>
      <Segmented
        value={s.advanced.effort}
        options={EFFORT_LEVELS.map((l) => ({ value: l, label: EFFORT_LABEL[l] }))}
        itemAttr="data-ega-effort-value"
        ariaLabel="Effort"
        describedBy="gen-effort-hint"
        onchange={(v) => void onSetGlobalEffort(v)}
      />
      <SettingHint setting="advanced.effort" id="gen-effort-hint" />
      {@render noteLines(notes.effort, 'effort')}
    </div>

    <div data-ega-setting="advanced.maxTokens">
      <Slider
        label="Longest answer"
        value={maxTokensDrag ?? s.advanced.maxTokens}
        min={16}
        max={8192}
        step={16}
        formatValue={tokens}
        defaultValue={DEF.advanced.maxTokens}
        help={settingHint('advanced.maxTokens')}
        modified={isFieldModified('advanced.maxTokens', s)}
        onchange={(v) => (maxTokensDrag = v)}
        oncommit={(v) => {
          maxTokensDrag = null;
          void onSetGlobalMaxTokens(v);
        }}
      />
      {@render noteLines(notes.maxTokens, 'max-tokens')}
    </div>

    <div data-ega-setting="advanced.temperature">
      <Slider
        label="Creativity (temperature)"
        value={temperatureDrag ?? s.advanced.temperature}
        min={0}
        max={2}
        step={0.05}
        defaultValue={DEF.advanced.temperature}
        help={settingHint('advanced.temperature')}
        modified={isFieldModified('advanced.temperature', s)}
        onchange={(v) => (temperatureDrag = v)}
        oncommit={(v) => {
          temperatureDrag = null;
          void onSetGlobalTemperature(v);
        }}
      />
      {@render noteLines(notes.temperature, 'temperature')}
    </div>
  </SectionCard>
</div>

<style>
  .effort-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .effort-label {
    display: inline-flex;
    gap: var(--space-2);
    font-size: var(--fs-base);
    color: var(--color-fg);
  }
  .changed {
    color: var(--color-muted);
  }
  .gen-note {
    margin: var(--space-1) 0 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-warning-fg);
  }
</style>
