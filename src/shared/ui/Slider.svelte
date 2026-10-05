<script lang="ts">
  import { Slider } from 'bits-ui';
  import { id as makeId } from '@/shared/uuid';
  import ResetField from '@/shared/ui/ResetField.svelte';

  interface Props {
    /** Visible label rendered above the track. */
    label: string;
    /** Current value (caller-controlled — this component is fully controlled). */
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Unit suffix appended to the live readout (e.g. " ms"). */
    unit?: string;
    /** One-line help text rendered below. */
    help?: string;
    disabled?: boolean;
    /** When true, an accent dot renders left of the label so the user
     *  can scan a long form for the controls they've touched. */
    modified?: boolean;
    /** 'percent' shows value*100 rounded with % and ignores unit; 'decimal' (default) shows value + unit. */
    format?: 'decimal' | 'percent';
    /** External id whose text describes the control (warning paragraph, hint).
     *  Joined into the slider's aria-describedby chain alongside help/modified. */
    describedById?: string;
    /** Shows a reset button next to the readout while modified and enabled. */
    onReset?: () => void;
    resetAriaLabel?: string;
    /** Tooltip for the reset button, e.g. "Default 0.2". */
    resetInheritedLabel?: string;
    /** Called on every value change (live drag tick). Use for local UI mirroring. */
    onchange: (v: number) => void;
    /** Called only when the user releases the thumb (pointer-up / keyup). Use for
     *  persistence-side effects (storage writes, toasts) that shouldn't fire per tick. */
    oncommit?: (v: number) => void;
  }

  let {
    label,
    value,
    min,
    max,
    step = 1,
    unit = '',
    help,
    disabled = false,
    modified = false,
    format = 'decimal',
    describedById,
    onReset,
    resetAriaLabel,
    resetInheritedLabel,
    onchange,
    oncommit,
  }: Props = $props();

  const showReset = $derived(onReset !== undefined && modified && !disabled);

  // One-shot bloom on release; the ~400ms attribute lifetime is short enough to read as a tap.
  let committed = $state(false);
  let commitTimer: ReturnType<typeof setTimeout> | null = null;
  function flashCommit(): void {
    committed = true;
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      committed = false;
      commitTimer = null;
    }, 400);
  }

  const readout = $derived(
    format === 'percent' ? `${Math.round(value * 100)}%` : `${value}${unit}`,
  );

  const rootId = makeId('ega-slider');
  const labelId = `${rootId}-label`;
  const helpId = `${rootId}-help`;
  const modifiedId = `${rootId}-modified`;

  // aria-describedby accepts several ids, so a space join is enough here.
  const describedBy = $derived(
    [help ? helpId : null, modified ? modifiedId : null, describedById ?? null]
      .filter(Boolean)
      .join(' ') || undefined,
  );
</script>

<div class="ega-slider" class:disabled>
  <div class="head">
    <span id={labelId} class="label">
      {#if modified}
        <span class="mod-dot" data-ega-modified-dot aria-hidden="true"></span>
        <span id={modifiedId} class="ega-sr-only">Modified from default</span>
      {/if}
      {label}
    </span>
    <span class="head-right">
      <span class="readout" aria-hidden="true">{readout}</span>
      <ResetField
        differsFromInherited={showReset}
        onReset={() => onReset?.()}
        ariaLabel={resetAriaLabel ?? 'Reset to default'}
        {...resetInheritedLabel !== undefined ? { inheritedLabel: resetInheritedLabel } : {}}
      />
    </span>
  </div>

  <Slider.Root
    type="single"
    {value}
    onValueChange={(v: number) => onchange(v)}
    onValueCommit={(v: number) => {
      flashCommit();
      oncommit?.(v);
    }}
    {min}
    {max}
    {step}
    {disabled}
    aria-labelledby={labelId}
    class="root"
    data-just-committed={committed ? '' : undefined}
  >
    <span class="track">
      <Slider.Range class="range" />
    </span>
    <Slider.Thumb
      index={0}
      class="thumb"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-valuetext={readout}
    />
  </Slider.Root>

  {#if help}
    <div id={helpId} class="help">{help}</div>
  {/if}
</div>

<style>
  .ega-slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: var(--space-3) 0;
    font-family: var(--font-ui);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    /* Fixed gutter so labels align whether or not the modified dot shows. */
    position: relative;
    padding-left: 14px;
  }
  .mod-dot {
    position: absolute;
    left: 1px;
    top: 50%;
    transform: translateY(-50%);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-accent);
  }
  .head-right {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex: 0 0 auto;
  }
  /* Live numeric readout — mono pill in the elevated surface tone so the
     value reads as a separate affordance, not part of the label text. */
  .readout {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    line-height: 1;
    color: var(--color-fg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    font-variant-numeric: tabular-nums;
  }
  /* Muted, not the disabled token: the label still names the setting, and axe checks a non-native control's text. */
  .ega-slider.disabled .label,
  .ega-slider.disabled .readout {
    color: var(--color-muted);
  }
  .ega-slider.disabled .readout {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
  }

  /* Fixed height: bits-ui positions the thumb absolutely and needs a vertical center. */
  .ega-slider :global(.root) {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 20px;
    touch-action: none;
    user-select: none;
    cursor: pointer;
  }
  .ega-slider.disabled :global(.root) {
    cursor: var(--cursor-disabled);
  }

  /* Track — the unfilled rail. 6 px tall pill, elevated surface + 1 px
     border so it stays visible on white-light surfaces. */
  .ega-slider .track {
    position: relative;
    flex: 1 1 auto;
    height: 6px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-pill);
    overflow: visible;
  }
  .ega-slider.disabled .track {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
  }

  /* Range — the filled portion from min up to the thumb. bits-ui sets
     inline left/width on the Range element; we just tone + radius it. */
  .ega-slider :global(.range) {
    position: absolute;
    height: 100%;
    background: var(--color-accent);
    border-radius: var(--radius-pill);
  }
  .ega-slider.disabled :global(.range) {
    background: var(--color-fg-disabled);
  }

  /* Thumb — 16 px disc with accent ring. Halo grows on hover / focus
     to match the Checkbox / Input / Button focus-ring family. */
  .ega-slider :global(.thumb) {
    display: block;
    width: 16px;
    height: 16px;
    background: var(--color-bg);
    border: 2px solid var(--color-accent);
    border-radius: var(--radius-pill);
    box-shadow: 0 1px 2px var(--color-shadow-soft);
    cursor: grab;
    transition:
      transform var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out);
  }
  .ega-slider :global(.thumb:hover) {
    box-shadow:
      0 1px 2px var(--color-shadow-soft),
      0 0 0 4px var(--color-accent-bg-hover);
  }
  .ega-slider :global(.thumb:focus-visible) {
    outline: none;
    box-shadow:
      0 1px 2px var(--color-shadow-soft),
      0 0 0 6px var(--color-accent-bg-soft);
  }
  .ega-slider :global(.thumb[data-active]) {
    cursor: grabbing;
    transform: scale(1.05);
  }
  @keyframes ega-slider-commit-bloom {
    0% {
      box-shadow:
        0 1px 2px var(--color-shadow-soft),
        0 0 0 8px var(--color-accent-bg-soft);
    }
    100% {
      box-shadow: 0 1px 2px var(--color-shadow-soft);
    }
  }
  .ega-slider :global(.root[data-just-committed] .thumb) {
    animation: ega-slider-commit-bloom 400ms var(--ease-out, ease-out) 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .ega-slider :global(.root[data-just-committed] .thumb) {
      animation: none;
    }
  }
  .ega-slider.disabled :global(.thumb) {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
    box-shadow: none;
    cursor: var(--cursor-disabled);
  }

  .help {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
</style>
