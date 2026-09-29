<script lang="ts">
  import { untrack } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Icon from '@/shared/ui/Icon.svelte';
  import type { Task, Tone } from '@/shared/task-prompts';
  import type { SettingsTab } from '@/shared/settings-tabs';
  import type { TipState } from './tipState.svelte';
  import ContextPreview from '@/shared/components/ContextPreview.svelte';
  import { humanizeContext } from '@/shared/components/humanizeContext';
  import DraggablePanel from '@/shared/components/DraggablePanel.svelte';
  import InspectorDrawer from '@/shared/components/InspectorDrawer.svelte';
  import TooltipHeader from '@/content/tooltip/TooltipHeader.svelte';
  import TooltipBody from '@/content/tooltip/TooltipBody.svelte';
  import TooltipActions from '@/content/tooltip/TooltipActions.svelte';

  interface Props {
    tip: TipState;
    clickOutsideDismiss: boolean;
    /** Echo the selected source text back to the user. */
    showSource?: boolean;
    /** Shows the swap-direction ↔ button when present. */
    onswap?: () => void;
    /** Direction hint; disables swap when source==='auto'. */
    direction?: { source: string; target: string };
    ontaskchange?: (task: Task, tone: Tone) => void;
    /** Drag-to-move on the non-interactive surface. */
    draggable?: boolean;
    onclose: () => void;
    oncancel: () => void;
    /** Absent means this surface cannot re-dispatch, so the Retry button never renders. */
    onretry?: () => void;
    oncopy: () => void;
    onexplain: () => void;
    onopenoptions: (tab?: SettingsTab) => void;
    /** Tooltip → sidepanel handoff; the parent assembles the payload. */
    onescalate?: (kind: 'continue' | 'pin' | 'open-image') => void;
  }

  let {
    tip,
    clickOutsideDismiss,
    showSource = false,
    onswap,
    direction,
    ontaskchange,
    draggable = false,
    onclose,
    oncancel,
    onretry,
    oncopy,
    onexplain,
    onopenoptions,
    onescalate,
  }: Props = $props();

  let contextOpen = $state<boolean>(untrack(() => tip.contextPreviewOpen ?? false));

  // Local, so reopening on a different translation always starts collapsed.
  let inspectorOpen = $state<boolean>(false);

  // "Reverse" has no meaning without a concrete source variety.
  const swapDisabled = $derived(!!direction && direction.source === 'auto');

  const mode: 'loading' | 'error' | 'success' = $derived.by(() => {
    if (tip.error) return 'error';
    if (tip.loading && !tip.body) return 'loading';
    return 'success';
  });

  // A null or empty context must not light the icon — clicking it would render "(no context)".
  const hasContext = $derived(
    tip.contextSent != null && humanizeContext(tip.contextSent).length > 0,
  );

  // A failed image translate has no source text and no OCR text, and the panel drops an empty handoff.
  const canEscalateContinue = $derived(
    mode === 'error' && tip.srcText.trim().length > 0 && !!onescalate,
  );
  // Image results get the open-image escalation instead; every text success can pin.
  const canEscalatePin = $derived(mode === 'success' && !tip.imageUrl && !!onescalate);
  const canEscalateOpenImage = $derived(mode === 'success' && !!tip.imageUrl && !!onescalate);
</script>

<DraggablePanel
  left={tip.left}
  top={tip.top}
  {draggable}
  {clickOutsideDismiss}
  ariaLabel="Ega translation"
  class="tooltip"
  onClose={onclose}
>
  <!-- Image tooltips wire no ontaskchange, so `imageUrl` alone must still show the close ✕. -->
  {#if ontaskchange || !clickOutsideDismiss || tip.imageUrl}
    <div class="tooltip-topbar">
      {#if ontaskchange}
        <TooltipHeader
          task={tip.task ?? 'translate'}
          tone={tip.tone ?? 'neutral'}
          onTaskChange={ontaskchange}
        />
      {/if}
      {#if !clickOutsideDismiss || tip.imageUrl}
        <button
          type="button"
          class="tooltip-close"
          aria-label="Close"
          data-tooltip="Close (Esc)"
          onclick={onclose}
        >
          <Icon icon={X} size={16} strokeWidth={1.6} class="icon" />
        </button>
      {/if}
    </div>
  {/if}

  {#if showSource}
    <div class="src" dir="auto">
      {tip.srcText.length > 140 ? tip.srcText.slice(0, 140) + '…' : tip.srcText}
    </div>
  {/if}

  <TooltipBody
    body={tip.body}
    loading={tip.loading}
    task={tip.task ?? 'translate'}
    {...tip.loadingLabel !== undefined ? { loadingLabel: tip.loadingLabel } : {}}
    {...tip.imageUrl !== undefined ? { imageUrl: tip.imageUrl } : {}}
    {...tip.explain !== undefined ? { explain: tip.explain } : {}}
    {...tip.usedImage ? { usedImage: true } : {}}
    {...tip.error !== undefined ? { error: tip.error } : {}}
    {...tip.priorTranslation !== undefined ? { diffAgainst: tip.priorTranslation } : {}}
    settled={tip.settled === true}
    onOpenOptions={onopenoptions}
  />

  <TooltipActions
    {tip}
    {mode}
    {...direction ? { direction } : {}}
    hasSwap={!!onswap}
    {swapDisabled}
    {hasContext}
    {contextOpen}
    {inspectorOpen}
    {canEscalateContinue}
    {canEscalatePin}
    {canEscalateOpenImage}
    onCancel={oncancel}
    onCopy={oncopy}
    onExplain={onexplain}
    {...onretry ? { onRetry: onretry } : {}}
    {...onswap ? { onSwap: onswap } : {}}
    onToggleContext={() => {
      contextOpen = !contextOpen;
      if (contextOpen) inspectorOpen = false;
    }}
    onToggleInspector={() => {
      inspectorOpen = !inspectorOpen;
      if (inspectorOpen) contextOpen = false;
    }}
    {...onescalate ? { onEscalate: onescalate } : {}}
  />

  <div class="ega-tooltip-details">
    {#if hasContext}
      <ContextPreview
        context={tip.contextSent ?? null}
        bind:open={contextOpen}
        hideToggle
        variant="tooltip"
      />
    {/if}

    {#if tip.meta}
      <InspectorDrawer
        meta={tip.meta}
        open={inspectorOpen}
        onClose={() => (inspectorOpen = false)}
      />
    {/if}
  </div>
</DraggablePanel>
