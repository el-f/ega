<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import { DEFAULT_CONFIDENCE_PILL_THRESHOLD } from '@/shared/constants';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import DisplayModeMock from '@/options/components/DisplayModeMock.svelte';
  import ChoiceCards from '@/options/components/ChoiceCards.svelte';
  import SettingHint from '@/options/components/SettingHint.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import { settingHint } from '@/shared/settings-registry';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
    /** "Reset section": the card's defaults, then a toast with Undo. */
    onResetCard: (title: string, defaults: Partial<Settings>) => Promise<void>;
  }
  const { s, onPatch, onResetCard }: Props = $props();

  const DEF = DEFAULT_SETTINGS;
  const TITLE = 'Where answers show';

  const pillThreshold = $derived(s.confidencePillThreshold ?? DEFAULT_CONFIDENCE_PILL_THRESHOLD);

  // The mode is a pick, not an option, so the reset leaves it alone.
  const RESET_IDS = [
    'display.confidencePill',
    'display.confidencePillThreshold',
    'display.tooltipShowSource',
    'display.tooltipClickOutside',
    'display.tooltipDraggable',
  ] as const;
  const modified = $derived(RESET_IDS.some((id) => isFieldModified(id, s)));

  function reset(): Promise<void> {
    return onResetCard(TITLE, {
      tooltipShowSource: DEF.tooltipShowSource,
      tooltipClickOutside: DEF.tooltipClickOutside,
      tooltipDraggable: DEF.tooltipDraggable,
      confidencePill: DEF.confidencePill,
      confidencePillThreshold: DEFAULT_CONFIDENCE_PILL_THRESHOLD,
    });
  }

  const MODES = [
    { value: 'tooltip', label: 'Tooltip', hint: 'Floats over the selection' },
    { value: 'inline', label: 'Inline', hint: 'Replaces the text in place' },
  ] as const;
</script>

<SectionCard
  title={TITLE}
  description="A tooltip over the selection, or the answer in place of the text"
  info={{
    label: 'About where answers show',
    text: 'The side panel always shows the whole conversation. This choice is for answers on the page.',
  }}
>
  {#snippet headerActions()}
    <SectionReset {modified} onReset={reset} />
  {/snippet}

  <ChoiceCards
    value={s.defaultDisplayMode}
    choices={MODES}
    ariaLabel="Where answers show"
    itemAttr="data-ega-mode"
    dataAttrs={{ 'data-ega-setting': 'display.defaultDisplayMode' }}
    onchange={(next) => void onPatch({ defaultDisplayMode: next })}
  >
    {#snippet visual(mode, active)}
      <DisplayModeMock variant={mode} {active} />
    {/snippet}
  </ChoiceCards>

  <!-- Both groups stay in Inline mode too: the side panel and Explain still use the tooltip settings. -->
  <div class="ds-group-block" data-ega-knob-group="shared">
    <h3 class="ds-group">Tooltip and side panel</h3>
    <div data-ega-setting="display.confidencePill">
      <Checkbox
        id="confidence-pill"
        label="Show confidence pill"
        checked={s.confidencePill}
        modified={isFieldModified('display.confidencePill', s)}
        onchange={(next) => void onPatch({ confidencePill: next })}
      />
    </div>
    <CollapsibleField open={s.confidencePill}>
      <div data-ega-setting="display.confidencePillThreshold">
        <Slider
          label="Hide the pill below"
          value={pillThreshold}
          min={0}
          max={1}
          step={0.05}
          format="percent"
          defaultValue={DEFAULT_CONFIDENCE_PILL_THRESHOLD}
          help={settingHint('display.confidencePillThreshold')}
          modified={isFieldModified('display.confidencePillThreshold', s)}
          onchange={(v) => void onPatch({ confidencePillThreshold: v })}
        />
      </div>
    </CollapsibleField>
  </div>

  <div class="ds-group-block" data-ega-knobs="tooltip">
    <h3 class="ds-group">Tooltip only</h3>
    <div data-ega-setting="display.tooltipShowSource">
      <Checkbox
        id="tooltip-show-source"
        label="Show the original text at the top"
        checked={s.tooltipShowSource}
        modified={isFieldModified('display.tooltipShowSource', s)}
        onchange={(next) => void onPatch({ tooltipShowSource: next })}
      />
    </div>
    <div data-ega-setting="display.tooltipClickOutside">
      <Checkbox
        id="tooltip-click-outside"
        label="Close when I click outside"
        checked={s.tooltipClickOutside}
        describedBy="tooltip-click-outside-hint"
        modified={isFieldModified('display.tooltipClickOutside', s)}
        onchange={(next) => void onPatch({ tooltipClickOutside: next })}
      />
      <SettingHint setting="display.tooltipClickOutside" id="tooltip-click-outside-hint" indent />
    </div>
    <div data-ega-setting="display.tooltipDraggable">
      <Checkbox
        id="tooltip-draggable"
        label="Let me drag the tooltip"
        checked={s.tooltipDraggable}
        modified={isFieldModified('display.tooltipDraggable', s)}
        onchange={(next) => void onPatch({ tooltipDraggable: next })}
      />
    </div>
  </div>
</SectionCard>

<style>
  .ds-group-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-2);
  }
  .ds-group {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-fg);
  }
</style>
