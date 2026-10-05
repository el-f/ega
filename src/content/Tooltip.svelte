<script lang="ts">
  import { untrack } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Icon from '@/shared/ui/Icon.svelte';
  import type { Tone } from '@/shared/task-prompts';
  import type { SettingsTab } from '@/shared/settings-tabs';
  import type { TipState } from './tipState.svelte';
  import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
  import { imageModeOf } from '@/shared/components/reply-details';
  import DraggablePanel from '@/shared/components/DraggablePanel.svelte';
  import TooltipHeader from '@/content/tooltip/TooltipHeader.svelte';
  import { materializeTasks, type TaskId } from '@/shared/task-view';
  import { taskUsesTone } from '@/shared/language-prompt';
  import { cachedCustomTasks } from '@/content/customs-cache';
  import { currentSettings } from '@/content/settings-cache';
  import TooltipBody from '@/content/tooltip/TooltipBody.svelte';
  import TooltipActions from '@/content/tooltip/TooltipActions.svelte';
  import { langTag, replyLang } from '@/shared/lang-tag';

  interface Props {
    tip: TipState;
    clickOutsideDismiss: boolean;
    /** Echo the selected source text back to the user. */
    showSource?: boolean;
    /** Shows the swap-direction ↔ button when present. */
    onswap?: () => void;
    /** Direction hint; disables swap when source==='auto'. */
    direction?: { source: string; target: string };
    ontaskchange?: (task: TaskId, tone: Tone) => void;
    /** Drag-to-move on the non-interactive surface. */
    draggable?: boolean;
    onclose: () => void;
    oncancel: () => void;
    /** Absent means this surface cannot re-dispatch, so the Retry button never renders. */
    onretry?: () => void;
    oncopy: () => void;
    onexplain: () => void;
    /** Absent on surfaces that cannot open Settings, so no Settings link renders. */
    onopenoptions?: (tab?: SettingsTab) => void;
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

  // Local, so reopening on a different translation always starts collapsed.
  let detailsOpen = $state<boolean>(untrack(() => tip.contextPreviewOpen ?? false));

  // "Reverse" has no meaning without a concrete source variety.
  const swapDisabled = $derived(!!direction && direction.source === 'auto');

  const mode: 'loading' | 'error' | 'success' = $derived.by(() => {
    if (tip.error) return 'error';
    if (tip.loading && !tip.body) return 'loading';
    return 'success';
  });

  const settingsNow = currentSettings();
  const taskViews = settingsNow ? materializeTasks(settingsNow, cachedCustomTasks()) : undefined;
  // The task the router ran: Explain for an explain re-run, else the picked task.
  const ranTask = $derived(tip.contextTask ?? tip.task ?? 'translate');
  // The router records whether page info went; before that arrives, a task with page context off never sends it.
  const contextShown = $derived(
    (tip.meta?.pageContextSent ?? taskViews?.find((v) => v.id === ranTask)?.pageContext ?? true)
      ? tip.contextSent
      : null,
  );
  const hasDetails = $derived(tip.meta !== undefined || tip.contextSent !== undefined);
  const taskLabel = $derived(taskViews?.find((v) => v.id === ranTask)?.label ?? 'Translate');
  // Translate reads an image with the built-in image prompt; Explain sends its own prompt with it.
  const imageMode = $derived(
    imageModeOf(
      tip.meta,
      tip.imageUrl === undefined ? undefined : ranTask === 'translate' ? 'ocr' : 'task',
    ),
  );

  // A failed image translate has no source text and no OCR text, and the panel drops an empty handoff.
  const canEscalateContinue = $derived(
    mode === 'error' && tip.srcText.trim().length > 0 && !!onescalate,
  );
  // Image results get the open-image escalation instead; every text success can pin.
  const canEscalatePin = $derived(mode === 'success' && !tip.imageUrl && !!onescalate);
  const canEscalateOpenImage = $derived(mode === 'success' && !!tip.imageUrl && !!onescalate);

  // Settings load before any tooltip shows; the fallbacks are the shipped tasks, where only Reword has {{tone}}.
  function usesToneFor(t: TaskId): boolean {
    const s = currentSettings();
    return s
      ? taskUsesTone(s, cachedCustomTasks(), t, direction?.source ?? 'auto')
      : t === 'reword';
  }
  // The shadow tree is lang=en for our UI; page text and a reply with no tag must say so themselves ('' is unknown).
  const pageLang = document.documentElement.lang;
  const input = $derived(tip.detectedLang ?? direction?.source);
  // Only an unresolved input (Auto-detect) is taken to be the page's language; a known variety with no tag is unknown.
  const inputIsPage = $derived(
    (tip.task === 'reword' || tip.task === 'grammar') &&
      (input === undefined || input === 'auto' || input === 'other'),
  );
  const bodyLang = $derived(
    langTag(replyLang(tip.task ?? 'translate', direction?.target, input)) ??
      (inputIsPage ? pageLang : ''),
  );
  const notesLang = $derived(langTag(direction?.target) ?? '');

  const explainOn = !(taskViews?.find((v) => v.id === 'explain')?.disabled ?? false);
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
          usesTone={usesToneFor(tip.task ?? 'translate')}
          views={taskViews}
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
    <div class="src" dir="auto" lang={pageLang}>
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
    {bodyLang}
    {notesLang}
    {...onopenoptions ? { onOpenOptions: onopenoptions } : {}}
  />

  <TooltipActions
    {tip}
    {mode}
    {...direction ? { direction } : {}}
    hasSwap={!!onswap}
    {swapDisabled}
    {hasDetails}
    {detailsOpen}
    {canEscalateContinue}
    {canEscalatePin}
    {canEscalateOpenImage}
    {explainOn}
    onCancel={oncancel}
    onCopy={oncopy}
    onExplain={onexplain}
    {...onretry ? { onRetry: onretry } : {}}
    {...onswap ? { onSwap: onswap } : {}}
    onToggleDetails={() => (detailsOpen = !detailsOpen)}
    {...onescalate ? { onEscalate: onescalate } : {}}
  />

  {#if detailsOpen && hasDetails}
    <div class="ega-tooltip-details">
      <ReplyDetails
        meta={tip.meta}
        context={contextShown}
        sentText={tip.srcText}
        image={imageMode}
        {taskLabel}
        {...onopenoptions ? { onViewPrompt: () => onopenoptions?.('tasks') } : {}}
        surface="tooltip"
        valueLang={pageLang}
        onClose={() => (detailsOpen = false)}
      />
    </div>
  {/if}
</DraggablePanel>
