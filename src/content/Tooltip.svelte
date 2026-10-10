<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Icon from '@/shared/ui/Icon.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import type { Tone } from '@/shared/task-prompts';
  import type { SettingsTab } from '@/shared/settings-tabs';
  import type { TipState } from './tipState.svelte';
  import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
  import ReplyMeta from '@/shared/components/ReplyMeta.svelte';
  import { directionLabel, replyMetaItems } from '@/shared/reply-meta';
  import { errorTurnParts } from '@/shared/error-parts';
  import { formatDetectedLabel } from '@/shared/detected-label';
  import { ISO_LANGUAGES } from '@/shared/languages';
  import { BUILT_IN_PRESETS } from '@/shared/presets';
  import { isUserGesture } from './user-gesture';
  import { imageModeOf } from '@/shared/components/reply-details';
  import DraggablePanel from '@/shared/components/DraggablePanel.svelte';
  import TooltipHeader from '@/content/tooltip/TooltipHeader.svelte';
  import {
    materializeTasks,
    SHIPPED_TASK_VIEWS,
    taskCapabilities,
    type TaskId,
  } from '@/shared/task-view';
  import { taskUsesTone } from '@/shared/language-prompt';
  import {
    cachedCustomTasks,
    cachedCustomLanguages,
    onCustomTasksUpdate,
  } from '@/content/customs-cache';
  import { currentSettings, onSettingsUpdate } from '@/content/settings-cache';
  import TooltipBody from '@/content/tooltip/TooltipBody.svelte';
  import TooltipActions from '@/content/tooltip/TooltipActions.svelte';
  import { langTag, replyLang } from '@/shared/lang-tag';
  import { id as makeId } from '@/shared/uuid';

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
    onregenerate?: () => void;
    onrefine?: (body: string) => void;
    ontargetchange?: (target: string) => void;
    oncopy: () => void;
    onexplain: () => void;
    /** Absent on surfaces that cannot open Settings, so no Settings link renders. */
    onopenoptions?: (tab?: SettingsTab) => void;
    /** Tooltip → sidepanel handoff; the parent assembles the payload. */
    onescalate?: (kind: 'continue' | 'pin' | 'open-image' | 'open-panel') => void;
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
    onregenerate,
    onrefine,
    ontargetchange,
    oncopy,
    onexplain,
    onopenoptions,
    onescalate,
  }: Props = $props();

  // Local, so reopening on a different translation always starts collapsed.
  let detailsOpen = $state<boolean>(untrack(() => tip.contextPreviewOpen ?? false));
  let errorDetailsOpen = $state(false);
  let editing = $state<'change' | 'language' | null>(null);
  let change = $state('');
  let languageIndex = $state('0');
  const targetId = makeId('ega-tooltip-target');
  let editor: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  // "Reverse" has no meaning without a concrete source variety.
  const swapDisabled = $derived(!!direction && direction.source === 'auto');

  const mode: 'loading' | 'error' | 'success' = $derived.by(() => {
    if (tip.error || tip.stopped) return 'error';
    if (tip.loading && !tip.body) return 'loading';
    return 'success';
  });

  let settingsNow = $state(untrack(currentSettings));
  let customTasksNow = $state.raw(untrack(cachedCustomTasks));
  onMount(() =>
    onCustomTasksUpdate((tasks) => {
      customTasksNow = tasks;
    }),
  );
  onMount(() =>
    onSettingsUpdate((s) => {
      settingsNow = s;
    }),
  );
  const taskViews = $derived(
    settingsNow ? materializeTasks(settingsNow, customTasksNow) : SHIPPED_TASK_VIEWS,
  );
  // The task the router ran: Explain for an explain re-run, else the picked task.
  const ranTask = $derived(tip.contextTask ?? tip.task ?? 'translate');
  // The router records whether page info went; before that arrives, a task with page context off never sends it.
  const contextShown = $derived(
    (tip.meta?.pageContextSent ?? taskViews?.find((v) => v.id === ranTask)?.pageContext ?? true)
      ? tip.contextSent
      : null,
  );
  const taskLabel = $derived(taskViews?.find((v) => v.id === ranTask)?.label ?? 'Deleted task');
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
    return s ? taskUsesTone(s, customTasksNow, t, direction?.source ?? 'auto') : t === 'reword';
  }
  // The shadow tree is lang=en for our UI; page text and a reply with no tag must say so themselves ('' is unknown).
  const pageLang = document.documentElement.lang;
  const input = $derived(tip.detectedLang ?? direction?.source);
  // Only an unresolved input (Auto-detect) is taken to be the page's language; a known variety with no tag is unknown.
  const inputIsPage = $derived(
    taskCapabilities(tip.task ?? 'translate', taskViews).answersIn === 'input' &&
      (input === undefined || input === 'auto' || input === 'other'),
  );
  const bodyLang = $derived(
    langTag(replyLang(tip.task ?? 'translate', direction?.target, input, taskViews)) ??
      (inputIsPage ? pageLang : ''),
  );
  const notesLang = $derived(langTag(direction?.target) ?? '');

  const replyDirection = $derived(
    directionLabel({
      ...(tip.detectedLangs?.length
        ? { detected: tip.detectedLangs }
        : tip.detectedLang
          ? {
              detected: [
                {
                  id: tip.detectedLang,
                  ...(tip.detectedDetail ? { detail: tip.detectedDetail } : {}),
                },
              ],
            }
          : tip.detectedDetail
            ? { detected: [{ id: 'other', detail: tip.detectedDetail }] }
            : {}),
      ...(direction ? { sourceLang: direction.source, targetLang: direction.target } : {}),
      sourceOnly: ranTask === 'reword' || ranTask === 'grammar',
      varieties: cachedCustomLanguages(),
    }),
  );
  const metaItems = $derived(
    replyMetaItems({
      meta: tip.meta,
      direction: replyDirection,
      confidence: tip.confidence,
      confidenceSetting: { show: tip.confidencePill, threshold: tip.confidencePillThreshold ?? 0 },
      ...(!tip.error && tip.settled !== true
        ? { status: tip.body ? 'Answering…' : 'Waiting for reply…' }
        : {}),
      ...(tip.error && tip.body ? { status: 'Partial answer' } : {}),
      ...(tip.stopped ? { status: 'Stopped' } : {}),
    }),
  );
  const errorParts = $derived(tip.error ? errorTurnParts(tip.error) : undefined);
  const translateInto = $derived(
    settingsNow && settingsNow.defaultTargetLang !== direction?.target
      ? {
          id: settingsNow.defaultTargetLang,
          label: formatDetectedLabel(
            settingsNow.defaultTargetLang,
            undefined,
            cachedCustomLanguages(),
          ),
        }
      : null,
  );
  const languageChoices = $derived([
    ...ISO_LANGUAGES.map((l) => ({ id: l.code, label: l.label })),
    ...BUILT_IN_PRESETS.filter((p) => !settingsNow?.disabledVarieties.includes(p.id)),
    ...cachedCustomLanguages().filter((l) => !settingsNow?.disabledVarieties.includes(l.id)),
  ]);
  async function openEditor(kind: 'change' | 'language'): Promise<void> {
    editing = kind;
    change = '';
    languageIndex = String(
      Math.max(
        0,
        languageChoices.findIndex((l) => l.id === direction?.target),
      ),
    );
    await tick();
    editor?.querySelector<HTMLElement>('textarea, select')?.focus();
  }
  function closeEditor(): void {
    editing = null;
    root?.querySelector<HTMLElement>('button[aria-label="Refine"]')?.focus();
  }
  function submitEditor(e: Event): void {
    e.preventDefault();
    if (!isUserGesture(e)) return;
    if (editing === 'change' && change.trim()) onrefine?.(change.trim());
    if (editing === 'language') {
      const picked = languageChoices[Number(languageIndex)];
      if (picked) ontargetchange?.(picked.id);
    }
    closeEditor();
  }
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
  <div class="tooltip-reply" bind:this={root}>
    <div class="tooltip-topbar">
      {#if ontaskchange && !tip.imageUrl}
        <TooltipHeader
          usesTone={usesToneFor(tip.task ?? 'translate')}
          views={taskViews}
          task={tip.task ?? 'translate'}
          tone={tip.tone ?? 'neutral'}
          onTaskChange={ontaskchange}
        />
      {:else if tip.imageUrl}
        <span class="tooltip-topbar-title"
          >{ranTask === 'explain' ? 'Image explanation' : 'Image translation'}</span
        >
      {/if}
      <button
        type="button"
        class="tooltip-close"
        aria-label="Close"
        data-tooltip="Close (Esc)"
        onclick={onclose}
      >
        <Icon icon={X} size={16} strokeWidth={1.6} class="icon" />
      </button>
    </div>

    {#if showSource}
      <div class="src" dir="auto" lang={pageLang}>
        {tip.srcText.length > 140 ? tip.srcText.slice(0, 140) + '…' : tip.srcText}
      </div>
    {/if}

    <TooltipBody
      views={taskViews}
      body={tip.body}
      loading={tip.loading}
      stopped={tip.stopped === true}
      task={tip.task ?? 'translate'}
      {...tip.loadingLabel !== undefined ? { loadingLabel: tip.loadingLabel } : {}}
      {...tip.imageUrl !== undefined ? { imageUrl: tip.imageUrl } : {}}
      {...tip.explain !== undefined ? { explain: tip.explain } : {}}
      {...tip.notes !== undefined ? { notes: tip.notes } : {}}
      {...tip.answer !== undefined ? { answer: tip.answer } : {}}
      {...tip.usedImage ? { usedImage: true } : {}}
      {...tip.error !== undefined ? { error: tip.error } : {}}
      settled={tip.settled === true}
      {bodyLang}
      {notesLang}
      {errorDetailsOpen}
    />

    <ReplyMeta items={metaItems} />

    {#if editing !== null}
      <!-- The group owns Escape so it closes this editor before the tooltip. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="tooltip-editor"
        bind:this={editor}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeEditor();
          }
        }}
        role="group"
        aria-label={editing === 'change' ? 'Describe a change' : 'Translate into another language'}
      >
        <!-- requestSubmit() from the page creates a trusted submit event. Only an actual Apply press may send. -->
        <form onsubmit={(e) => e.preventDefault()}>
          {#if editing === 'change'}
            <label>Describe a change<textarea bind:value={change} rows="3"></textarea></label>
          {:else}
            <label for={targetId}>Translate into</label>
            <Select
              id={targetId}
              bind:value={languageIndex}
              options={languageChoices.map((language, i) => ({
                value: String(i),
                label: language.label,
              }))}
            />
          {/if}
          <div class="tooltip-editor-actions">
            <button
              type="button"
              onclick={submitEditor}
              disabled={editing === 'change' && !change.trim()}>Apply</button
            >
            <button type="button" onclick={closeEditor}>Cancel</button>
          </div>
        </form>
      </div>
    {/if}

    <TooltipActions
      {tip}
      {mode}
      task={ranTask}
      views={taskViews}
      {swapDisabled}
      {detailsOpen}
      {errorDetailsOpen}
      hasErrorDetails={errorParts?.detail !== undefined}
      {translateInto}
      escalationKind={mode === 'error'
        ? tip.imageUrl
          ? 'open-panel'
          : 'continue'
        : tip.imageUrl
          ? 'open-image'
          : 'pin'}
      canEscalate={canEscalateContinue ||
        canEscalatePin ||
        canEscalateOpenImage ||
        (mode === 'error' && !!tip.imageUrl && !!onescalate)}
      changing={editing !== null}
      onCancel={oncancel}
      onCopy={oncopy}
      onRetry={onretry}
      onRegenerate={onregenerate}
      onRefine={onrefine}
      onTranslate={ontargetchange}
      onSwap={onswap}
      onDescribe={() => void openEditor('change')}
      onTranslateOther={() => void openEditor('language')}
      onTaskChange={ontaskchange
        ? (id) => (id === 'explain' ? onexplain() : ontaskchange(id, tip.tone ?? 'neutral'))
        : undefined}
      onToggleDetails={(open) => (detailsOpen = open)}
      onToggleErrorDetails={() => (errorDetailsOpen = !errorDetailsOpen)}
      onOpenOptions={onopenoptions}
      onEscalate={onescalate
        ? () =>
            onescalate(
              mode === 'error'
                ? tip.imageUrl
                  ? 'open-panel'
                  : 'continue'
                : tip.imageUrl
                  ? 'open-image'
                  : 'pin',
            )
        : undefined}
    />

    {#if detailsOpen}
      <div class="ega-tooltip-details">
        <ReplyDetails
          meta={tip.meta}
          details={tip.details}
          answer={tip.answer}
          context={contextShown}
          sentText={tip.srcText}
          image={imageMode}
          {taskLabel}
          direction={replyDirection}
          confidence={tip.confidence}
          recordsDetails={settingsNow?.captureResultMeta}
          showClose={false}
          {...onopenoptions ? { onViewPrompt: () => onopenoptions?.('tasks') } : {}}
          surface="tooltip"
          valueLang={pageLang}
          onClose={() => (detailsOpen = false)}
        />
      </div>
    {/if}
  </div>
</DraggablePanel>
