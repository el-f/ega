<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import { withImageSurface, type MenuSurface } from '@/shared/context-menu';
  import { DEFAULT_CONFIDENCE_PILL_THRESHOLD } from '@/shared/constants';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import DisplayModeMock from '@/options/components/DisplayModeMock.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();

  const DEF = DEFAULT_SETTINGS;
  const mode = $derived(s.defaultDisplayMode);

  const pillThreshold = $derived(s.confidencePillThreshold ?? DEFAULT_CONFIDENCE_PILL_THRESHOLD);

  // The mode and the image surface are picks, not options, so the reset leaves them alone whatever the mode.
  const RESET_IDS = [
    'display.confidencePill',
    'display.confidencePillThreshold',
    'display.tooltipShowSource',
    'display.tooltipClickOutside',
    'display.tooltipDraggable',
  ] as const;
  const modified = $derived(RESET_IDS.some((id) => isFieldModified(id, s)));

  async function resetOptions(): Promise<void> {
    await onPatch({
      tooltipShowSource: DEF.tooltipShowSource,
      tooltipClickOutside: DEF.tooltipClickOutside,
      tooltipDraggable: DEF.tooltipDraggable,
      confidencePill: DEF.confidencePill,
      confidencePillThreshold: DEFAULT_CONFIDENCE_PILL_THRESHOLD,
    });
  }

  function pickMode(next: Settings['defaultDisplayMode']): void {
    if (next === mode) return;
    void onPatch({ defaultDisplayMode: next });
  }

  const MODES = [
    { id: 'tooltip', label: 'Tooltip', hint: 'Floats over the selection' },
    { id: 'inline', label: 'Inline', hint: 'Replaces text in place' },
  ] as const satisfies ReadonlyArray<{
    id: Settings['defaultDisplayMode'];
    label: string;
    hint: string;
  }>;

  function onRadioKeydown(e: KeyboardEvent): void {
    const idx = MODES.findIndex((x) => x.id === mode);
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % MODES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + MODES.length) % MODES.length;
    else return;
    e.preventDefault();
    const target = MODES[next];
    if (target !== undefined) {
      pickMode(target.id);
      const el = e.currentTarget as HTMLElement;
      el.querySelector<HTMLElement>(`[data-ega-mode="${target.id}"]`)?.focus();
    }
  }
</script>

<SectionCard
  title="Display surface"
  description="Where translations land — tooltip floating over the selection, or inline replacement."
>
  {#snippet headerActions()}
    <SectionReset
      {modified}
      onReset={resetOptions}
      label="Reset pill and tooltip options"
      ariaLabel="Reset pill and tooltip options to defaults"
    />
  {/snippet}

  <!-- tabindex -1: roving focus lives on the radios; the container only delegates keys. -->
  <div
    class="ds-cards"
    role="radiogroup"
    aria-label="Display surface mode"
    data-ega-setting="display.defaultDisplayMode"
    tabindex="-1"
    onkeydown={onRadioKeydown}
  >
    {#each MODES as m (m.id)}
      {@const isActive = mode === m.id}
      <button
        type="button"
        role="radio"
        aria-checked={isActive}
        tabindex={isActive ? 0 : -1}
        class="ds-card"
        class:active={isActive}
        data-ega-mode={m.id}
        onclick={() => pickMode(m.id)}
      >
        <DisplayModeMock variant={m.id} active={isActive} />
        <span class="ds-card-label">{m.label}</span>
        <span class="ds-card-hint">{m.hint}</span>
      </button>
    {/each}
  </div>

  <div class="ds-shared-knob" data-ega-setting="display.imageTranslateSurface">
    <Select
      label="Image translation opens in"
      value={s.imageTranslateSurface}
      modified={isFieldModified('display.imageTranslateSurface', s)}
      options={[
        { value: 'sidepanel', label: 'Side panel — full chat surface' },
        { value: 'tooltip', label: 'Tooltip — anchored to the image' },
      ]}
      onchange={(v) =>
        void onPatch({
          imageTranslateSurface: v as Settings['imageTranslateSurface'],
          // The context-menu items carry the authoritative surface, so the global writes through.
          contextMenuItems: withImageSurface(s.contextMenuItems, v as MenuSurface),
        })}
    />
  </div>

  <div class="ds-shared-knob ds-knob-stack">
    <h3 class="ds-group">Tooltip and side panel</h3>
    <div data-ega-setting="display.confidencePill">
      <Checkbox
        id="confidence-pill"
        label="Confidence pill"
        checked={s.confidencePill}
        modified={isFieldModified('display.confidencePill', s)}
        onchange={(next) => void onPatch({ confidencePill: next })}
      />
    </div>
    <CollapsibleField open={s.confidencePill}>
      <div data-ega-setting="display.confidencePillThreshold">
        <Slider
          label="Confidence threshold"
          value={pillThreshold}
          min={0}
          max={1}
          step={0.05}
          format="percent"
          help="Hide the pill below this confidence score; 0 = always show."
          modified={isFieldModified('display.confidencePillThreshold', s)}
          onchange={(v) => void onPatch({ confidencePillThreshold: v })}
        />
      </div>
    </CollapsibleField>
  </div>

  <div class="ds-knob-panel" data-ega-mode-knob-panel={mode}>
    {#key mode}
      <div class="ds-knob-fade">
        {#if mode === 'tooltip'}
          <div class="ds-knob-stack" data-ega-knobs="tooltip">
            <h3 class="ds-group">Tooltip only</h3>
            <div data-ega-setting="display.tooltipShowSource">
              <Checkbox
                id="tooltip-show-source"
                label="Show original selection at the top of the tooltip"
                checked={s.tooltipShowSource}
                modified={isFieldModified('display.tooltipShowSource', s)}
                onchange={(next) => void onPatch({ tooltipShowSource: next })}
              />
            </div>
            <div data-ega-setting="display.tooltipClickOutside">
              <Checkbox
                id="tooltip-click-outside"
                label="Click outside to dismiss (hides the close button)"
                checked={s.tooltipClickOutside}
                modified={isFieldModified('display.tooltipClickOutside', s)}
                onchange={(next) => void onPatch({ tooltipClickOutside: next })}
              />
            </div>
            <div data-ega-setting="display.tooltipDraggable">
              <Checkbox
                id="tooltip-draggable"
                label="Drag-to-move tooltip"
                checked={s.tooltipDraggable}
                modified={isFieldModified('display.tooltipDraggable', s)}
                onchange={(next) => void onPatch({ tooltipDraggable: next })}
              />
            </div>
          </div>
        {:else}
          <div class="ds-knob-stack" data-ega-knobs="inline">
            <p class="ds-knob-note">Inline mode has no settings of its own.</p>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</SectionCard>

<style>
  .ds-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .ds-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .ds-card:hover:not(.active) {
    border-color: var(--color-border-strong, var(--color-fg-subtle));
  }
  .ds-card.active {
    border-color: var(--color-accent);
    background: var(--color-accent-bg-soft);
  }
  .ds-card:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ds-card-label {
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1.2;
  }
  .ds-card-hint {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    line-height: 1.3;
  }
  .ds-card.active .ds-card-hint {
    color: var(--color-muted);
  }
  .ds-shared-knob {
    padding-top: var(--space-3);
    margin-top: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
  }
  .ds-knob-panel {
    padding-top: var(--space-2);
    margin-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }
  .ds-knob-stack {
    display: flex;
    flex-direction: column;
    gap: var(--row-gap);
  }
  .ds-group {
    margin: 0;
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-muted);
  }
  .ds-knob-note {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  /* tokens.css zeroes animation-duration under `prefers-reduced-motion`. */
  .ds-knob-fade {
    animation: ds-fade-in var(--motion-fast) var(--ease-out) both;
  }
  @keyframes ds-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .ds-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
