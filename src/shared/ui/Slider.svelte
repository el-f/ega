<script lang="ts">
  import { Slider } from 'bits-ui';
  import { id as makeId } from '@/shared/uuid';
  import ResetField from '@/shared/ui/ResetField.svelte';
  import Badge from '@/shared/ui/Badge.svelte';

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
    /** Readout text for a value; wins over unit and format ("2,048 tokens", "0.8 s"). */
    formatValue?: (v: number) => string;
    /** One-line hint rendered below: one sentence, no full stop. */
    help?: string;
    /** Stays focusable and announced but does not move; say why with disabledReason or describedById. */
    disabled?: boolean;
    /** Visible line under the slider saying why it cannot move; read as its description. */
    disabledReason?: string;
    /** Shows the word "Changed" after the label. */
    modified?: boolean;
    /** 'percent' shows value*100 rounded with % and ignores unit; 'decimal' (default) shows value + unit. */
    format?: 'decimal' | 'percent';
    /** External id whose text describes the control (warning paragraph, hint).
     *  Joined into the slider's aria-describedby chain alongside help/modified. */
    describedById?: string;
    /** Draws a tick on the track at the shipped default and reads "Default <value>" as part of the description. */
    defaultValue?: number;
    /** A short pill after the label, such as "Experimental". */
    badge?: string;
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
    formatValue,
    help,
    disabled = false,
    disabledReason,
    modified = false,
    format = 'decimal',
    describedById,
    defaultValue,
    badge,
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

  function show(v: number): string {
    if (formatValue) return formatValue(v);
    return format === 'percent' ? `${Math.round(v * 100)}%` : `${v}${unit}`;
  }
  const readout = $derived(show(value));

  const rootId = makeId('ega-slider');
  const labelId = `${rootId}-label`;
  const helpId = `${rootId}-help`;
  const modifiedId = `${rootId}-modified`;
  const defaultId = `${rootId}-default`;
  const reasonId = `${rootId}-reason`;

  const tickAt = $derived(
    defaultValue === undefined || max <= min
      ? null
      : Math.min(100, Math.max(0, ((defaultValue - min) / (max - min)) * 100)),
  );

  // aria-describedby accepts several ids, so a space join is enough here.
  const describedBy = $derived(
    [
      disabled && disabledReason ? reasonId : null,
      help ? helpId : null,
      modified ? modifiedId : null,
      defaultValue !== undefined ? defaultId : null,
      describedById ?? null,
    ]
      .filter(Boolean)
      .join(' ') || undefined,
  );

  // A disabled control keeps its Tab stop (it announces why); only the keys and pointer that move it are blocked.
  const MOVE_KEYS = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ]);
  function blockKeys(e: KeyboardEvent): void {
    if (disabled && MOVE_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function blockPointer(e: PointerEvent): void {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
</script>

<div class="ega-slider" class:disabled>
  <div class="head">
    <span class="label-group">
      <span id={labelId} class="label">{label}</span>
      {#if badge}<Badge variant="warning">{badge}</Badge>{/if}
      {#if modified}
        <span id={modifiedId} class="changed" data-ega-modified="true">Changed</span>
      {/if}
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

  <div class="track-wrap" onkeydowncapture={blockKeys} onpointerdowncapture={blockPointer}>
    <Slider.Root
      type="single"
      {value}
      onValueChange={(v: number) => {
        if (!disabled) onchange(v);
      }}
      onValueCommit={(v: number) => {
        if (disabled) return;
        flashCommit();
        oncommit?.(v);
      }}
      {min}
      {max}
      {step}
      aria-labelledby={labelId}
      class="root"
      data-just-committed={committed ? '' : undefined}
    >
      <span class="track">
        <Slider.Range class="range" />
        {#if tickAt !== null}
          <span class="tick" style:left="{tickAt}%" aria-hidden="true" data-ega-default-tick></span>
        {/if}
      </span>
      <Slider.Thumb index={0}>
        {#snippet child({ props })}
          <!-- After the spread: bits-ui stamps aria-disabled from its own disabled state, which stays off to keep the Tab stop. -->
          <span
            {...props}
            class="thumb"
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            aria-valuetext={readout}
            aria-disabled={disabled ? 'true' : 'false'}
          ></span>
        {/snippet}
      </Slider.Thumb>
    </Slider.Root>
  </div>

  {#if defaultValue !== undefined}
    <span id={defaultId} class="ega-sr-only">Default {show(defaultValue)}</span>
  {/if}
  {#if disabled && disabledReason}
    <div id={reasonId} class="help" data-ega-disabled-reason>{disabledReason}</div>
  {/if}
  {#if help}
    <div id={helpId} class="help" data-ega-hint>{help}</div>
  {/if}
</div>

<style>
  .ega-slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-family: var(--font-ui);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .label-group {
    display: inline-flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }
  .label {
    font-size: var(--fs-base);
    color: var(--color-fg);
  }
  .changed {
    font-size: var(--fs-base);
    color: var(--color-muted);
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
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-fg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-2);
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
    height: 24px;
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
  .tick {
    position: absolute;
    top: -5px;
    width: 2px;
    height: 14px;
    margin-left: -1px;
    background: var(--color-muted);
    border-radius: 1px;
    pointer-events: none;
  }
  /* Forced colours would paint the tick as a gap in the track; it keeps the text colour instead (K-21). */
  @media (forced-colors: active) {
    .tick {
      forced-color-adjust: none;
      background: CanvasText;
    }
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
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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
    .ega-slider :global(.thumb) {
      transition: none;
    }
  }
  .ega-slider.disabled :global(.thumb) {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
    box-shadow: none;
    cursor: var(--cursor-disabled);
  }

  .help {
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
