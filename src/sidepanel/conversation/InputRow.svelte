<script lang="ts">
  import { tick } from 'svelte';
  import { debugCatch } from '@/shared/logger';
  import { toastStore } from '@/shared/components/toastStore';
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import TaskPicker from '@/shared/components/TaskPicker.svelte';
  import ComposerOptions from './ComposerOptions.svelte';
  import ImagePreview from '@/shared/components/ImagePreview.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import X from '@lucide/svelte/icons/x';
  import Send from '@lucide/svelte/icons/send';
  import StopCircle from '@lucide/svelte/icons/circle-stop';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import Mic from '@lucide/svelte/icons/mic';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import type { Variety } from '@/shared/types';
  import { ALL_TONES, TONE_LABELS, type Tone } from '@/shared/task-prompts';
  import { SHIPPED_TASK_VIEWS, taskLabel, type TaskId, type TaskView } from '@/shared/task-view';
  import { isMacLike } from '@/shared/utils/platform';
  import { chatContextLabel, CHAT_HISTORY_TOKEN_BUDGET } from '@/shared/chat-history';
  import { MAX_SELECTION_CHARS } from '@/shared/constants';
  import { attachedImageProblem } from '@/shared/image-url-guard';
  import { isIsoCode, labelFor } from '@/shared/languages';
  import type { ConversationTurnLike } from '@/shared/chat-history';

  interface SpeechRecognitionLike {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onend: (() => void) | null;
    onerror: ((ev: { error: string }) => void) | null;
    start(): void;
    stop(): void;
  }
  type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

  type VendorWindow = {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  const SpeechRecognitionCtor: SpeechRecognitionCtor | undefined =
    typeof window !== 'undefined'
      ? ((window as unknown as VendorWindow).SpeechRecognition ??
        (window as unknown as VendorWindow).webkitSpeechRecognition)
      : undefined;

  interface Props {
    /** Two-way bound textarea content. */
    value: string;
    sourceLang: string;
    targetLang: string;
    swapDisabled: boolean;
    task: TaskId;
    tone: Tone;
    /** The task's prompt has a {{tone}} slot, so the tone select shows. */
    usesTone: boolean;
    /** Every task, on or off; the chip strip offers the ones that are on. */
    taskViews?: readonly TaskView[] | undefined;
    varieties: Variety[];
    /** Mirror of Settings.pageContextLevel; writes through onContextLevelChange. */
    pageContextLevel: 'minimal' | 'rich';
    /** Mirror of Settings.contextEnabled. False hides the level picker — nothing is collected. */
    contextEnabled?: boolean;
    onOpenOptions?: () => void;
    /** Attached image data URL for the next user turn (image-translate). */
    attachedImage: string | null;
    /** True when the assistant is currently streaming. Drives Cancel button. */
    inflight: boolean;
    /** Prior conversation turns — used to compute the context indicator. */
    turns: readonly ConversationTurnLike[];
    onContextLevelChange: (level: 'minimal' | 'rich') => void;
    onSwap: () => void;
    /** A user pick on the target picker only — programmatic sets of `targetLang` never fire it. */
    onTargetChange?: (value: string) => void;
    onAttachImage: (dataUrl: string) => void;
    onClearAttachedImage: () => void;
    /** Whether streaming is enabled for the next send. */
    streaming: boolean;
    onSend: () => void;
    onCancel: () => void;
    onToggleStreaming: (next: boolean) => void;
  }

  let {
    value = $bindable(),
    sourceLang = $bindable(),
    targetLang = $bindable(),
    swapDisabled,
    task = $bindable(),
    usesTone,
    taskViews = SHIPPED_TASK_VIEWS,
    tone = $bindable(),
    varieties,
    pageContextLevel,
    contextEnabled = true,
    onOpenOptions,
    attachedImage,
    inflight,
    turns,
    onContextLevelChange,
    onSwap,
    onTargetChange,
    onAttachImage,
    onClearAttachedImage,
    streaming,
    onSend,
    onCancel,
    onToggleStreaming,
  }: Props = $props();

  let dragActive = $state(false);
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let imageInputEl: HTMLInputElement | null = $state(null);
  let recognizing = $state(false);
  let recog: SpeechRecognitionLike | null = null;

  // 'auto' and preset ids are not BCP-47; without a real code the recognizer falls back to the page's lang.
  const dictationLang = $derived(isIsoCode(sourceLang) ? sourceLang : navigator.language);
  const dictationLabel = $derived(
    isIsoCode(dictationLang)
      ? labelFor(dictationLang)
      : labelFor(dictationLang.split('-')[0] ?? dictationLang),
  );

  $effect(() => {
    return () => {
      recog?.stop();
    };
  });

  function dictationErrorMessage(code: string): string {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone access is blocked. Allow the microphone in Chrome site settings.';
      case 'no-speech':
        return 'Nothing was heard. Try again.';
      case 'audio-capture':
        return 'No microphone was found.';
      case 'network':
        return 'Dictation needs a network connection.';
      default:
        return 'Dictation stopped. Try again.';
    }
  }

  function toggleDictation(): void {
    if (recognizing) {
      recog?.stop();
    } else {
      if (!SpeechRecognitionCtor) return;
      const instance = new SpeechRecognitionCtor();
      recog = instance;
      instance.interimResults = false;
      instance.continuous = false;
      instance.lang = dictationLang;
      instance.onresult = (ev) => {
        const last = ev.results[ev.results.length - 1];
        const t = last?.[0]?.transcript ?? '';
        if (t) value = value.trim() ? value + ' ' + t : t;
      };
      instance.onend = () => {
        if (recog === instance) recognizing = false;
      };
      instance.onerror = (ev) => {
        // Pressing Stop reports 'aborted'; that is not a failure.
        if (ev.error === 'aborted') return;
        if (recog === instance) recognizing = false;
        toastStore.push({ message: dictationErrorMessage(ev.error), variant: 'warning' });
      };
      instance.start();
      recognizing = true;
    }
  }

  const toneOptions = ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }));

  // An image send carries no history (buildStartArgs), so the label would promise context that is not sent.
  const contextLabel = $derived(
    attachedImage ? null : chatContextLabel(turns, { budgetTokens: CHAT_HISTORY_TOKEN_BUDGET }),
  );

  // The service worker cuts anything past the cap, so the composer has to stop it here or the answer covers half the text.
  const overCap = $derived(value.length > MAX_SELECTION_CHARS);
  const nearCap = $derived(value.length > MAX_SELECTION_CHARS * 0.8);
  // Only translate and explain reach the vision model, so an image turns any other task into Translate.
  // A task that takes no images sends an attached one to Translate.
  const imageForcesTranslate = $derived(
    attachedImage !== null && !(taskViews.find((v) => v.id === task)?.image ?? false),
  );
  const sendLabel = $derived(imageForcesTranslate ? 'Translate image' : taskLabel(taskViews, task));
  const sendShortcutLabel = isMacLike() ? 'Send · ⌘↵' : 'Send · Ctrl↵';
  const sendKeyLabel = isMacLike() ? 'Cmd+Enter' : 'Ctrl+Enter';
  const sendTooltip = $derived(
    overCap
      ? `Too long — ${value.length} of ${MAX_SELECTION_CHARS} characters`
      : imageForcesTranslate
        ? 'Images support Translate and Explain'
        : sendShortcutLabel,
  );

  function handleKeyDown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (inflight) {
        // The Send button swapping to Stop is not feedback on this keypress.
        toastStore.push({
          message: 'Wait for the current reply, or press Stop.',
          variant: 'warning',
        });
        return;
      }
      if (!overCap) onSend();
      return;
    }
    if (e.key === 'Escape') {
      if (inflight) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      // Otherwise let it propagate: the window handler cancels a pending edit.
      return;
    }
    // Plain keys stop here so the parent `j` / `k` navigation doesn't fire while typing.
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      e.stopPropagation();
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
      r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
      r.readAsDataURL(file);
    });
  }

  // Checked here, where the user acts: an image the turn cannot carry would go out as the bare "[image]" text.
  function attach(dataUrl: string): void {
    if (!dataUrl) return;
    const problem = attachedImageProblem(dataUrl);
    if (problem !== null) {
      toastStore.push({ message: problem, variant: 'warning' });
      return;
    }
    onAttachImage(dataUrl);
  }

  async function ingestImageList(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    // First image only: a turn carries one image.
    let target: File | null = null;
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        target = f;
        break;
      }
    }
    if (!target) {
      toastStore.push({ message: 'Only images can be attached.', variant: 'warning' });
      return;
    }
    try {
      attach(await fileToDataUrl(target));
    } catch (e) {
      debugCatch(e, 'sidepanel.conversation.InputRow.1');
    }
  }

  function appendDroppedText(text: string): void {
    value = value.trim() ? value.trimEnd() + '\n' + text : text;
    const el = textareaEl;
    if (!el) return;
    el.focus();
    // The bound value reaches the DOM on the next flush, so the caret moves after it.
    void tick().then(() => el.setSelectionRange(el.value.length, el.value.length));
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    dragActive = false;
    const dt = e.dataTransfer;
    if (!dt) return;
    const text = dt.getData('text/plain');
    const files = Array.from(dt.files);
    // Image files win — image-translate is single-attach per turn — but the text half is not dropped in silence.
    if (files.some((f) => f.type.startsWith('image/'))) {
      void ingestImageList(dt.files);
      if (text.trim()) {
        toastStore.push({
          message: 'Image attached — the dropped text was ignored.',
          variant: 'info',
        });
      }
      return;
    }
    if (text) {
      appendDroppedText(text);
      return;
    }
    if (files.length > 0) {
      toastStore.push({ message: 'Only images can be attached.', variant: 'warning' });
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent): void {
    const to = e.relatedTarget;
    const row = e.currentTarget;
    // Moving onto a child fires dragleave on the row; only a real exit clears the tint.
    if (to instanceof Node && row instanceof Node && row.contains(to)) return;
    dragActive = false;
  }

  function handlePaste(e: ClipboardEvent): void {
    const cd = e.clipboardData;
    if (!cd) return;
    // Excel, Word and mail clients put the selected text AND a picture of it on the clipboard.
    // The text is what the user chose; the paperclip stays the explicit route for an image.
    if (cd.getData('text/plain').trim()) return;
    const items = cd.items;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          fileToDataUrl(f)
            .then(attach)
            .catch((err: unknown) => {
              debugCatch(err, 'sidepanel.inputrow.paste');
              toastStore.push({ message: 'Could not read the pasted image.', variant: 'warning' });
            });
          return;
        }
      }
    }
  }
</script>

<!-- The row is the drop target: the textarea's own background hides the tint painted here. -->
<div
  class="ega-input-row"
  class:drag-active={dragActive}
  role="presentation"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  <div class="ega-meta-row">
    <div class="ega-lang-pair">
      <LanguagePicker id="sp-conv-source" {varieties} includeAuto bind:value={sourceLang} />
      <!-- aria-disabled, not disabled: a disabled button cannot take focus, so its reason would be hover-only. -->
      <button
        type="button"
        class="swap"
        aria-label={swapDisabled
          ? 'Swap source and target — pick a source language first'
          : 'Swap source and target'}
        aria-disabled={swapDisabled}
        data-tooltip={swapDisabled ? 'Pick a source language first' : 'Swap source and target'}
        data-tooltip-placement="top"
        onclick={() => {
          if (!swapDisabled) onSwap();
        }}><ArrowLeftRight size={16} /></button
      >
      <LanguagePicker
        id="sp-conv-target"
        {varieties}
        bind:value={targetLang}
        onchange={(v) => onTargetChange?.(v)}
      />
    </div>
    <ComposerOptions
      {pageContextLevel}
      {contextEnabled}
      historyLabel={contextLabel}
      {streaming}
      {onContextLevelChange}
      {onToggleStreaming}
      onOpenOptions={() => onOpenOptions?.()}
    />
  </div>

  {#if attachedImage}
    <div class="ega-attached-image">
      <ImagePreview src={attachedImage} alt="Attached image" />
      <IconButton
        icon={X}
        ariaLabel="Remove attached image"
        size="sm"
        onclick={onClearAttachedImage}
      />
    </div>
  {/if}

  <div class="ega-input-box">
    <!-- dir=auto: Hebrew, Arabic or Arabizi typed here must align by its own first strong character. -->
    <textarea
      id="sp-text"
      class="ega-input-textarea"
      dir="auto"
      aria-label="Message"
      placeholder={attachedImage
        ? `Press ${sendKeyLabel} to translate the image, or add notes…`
        : `Translate, ask, reword, explain — drop text or an image. ${sendKeyLabel} to send.`}
      rows="2"
      bind:this={textareaEl}
      bind:value
      onkeydown={handleKeyDown}
      onpaste={handlePaste}></textarea>

    <div class="ega-send-row">
      <IconButton
        icon={Paperclip}
        ariaLabel="Attach image"
        size="md"
        dataAttrs={{ 'data-ega-attach-image': true }}
        onclick={() => imageInputEl?.click()}
      />
      {#if SpeechRecognitionCtor}
        <button
          type="button"
          class="ega-mic-btn"
          aria-label={recognizing ? 'Stop dictation' : `Dictate in ${dictationLabel}`}
          aria-pressed={recognizing}
          data-tooltip={recognizing ? 'Stop dictation' : `Dictate in ${dictationLabel}`}
          data-tooltip-placement="top-end"
          data-ega-mic
          onclick={toggleDictation}
        >
          {#if recognizing}<StopCircle size={16} />{:else}<Mic size={16} />{/if}
        </button>
      {/if}
      {#if nearCap}
        <!-- A blocked Send is not focusable, so the count is what a screen reader gets. -->
        <span class="ega-char-count" class:over={overCap} aria-live="polite"
          >{value.length}/{MAX_SELECTION_CHARS}</span
        >
      {/if}
      <!-- One element across the swap: with two buttons, activating Send would unmount the focused node. -->
      <button
        type="button"
        class="ega-send"
        class:danger={inflight}
        aria-label={inflight ? 'Stop' : sendLabel}
        data-tooltip={inflight ? 'Stop · Esc' : sendTooltip}
        data-tooltip-placement="top-end"
        disabled={!inflight && ((!value.trim() && !attachedImage) || overCap)}
        onclick={() => {
          if (inflight) {
            onCancel();
            // The button is about to swap back to Send and disable itself on an empty composer.
            textareaEl?.focus();
            return;
          }
          onSend();
          // The next message is typed in the box, so focus goes there, not to a button that changed label.
          textareaEl?.focus();
        }}
      >
        {#if inflight}
          <StopCircle size={16} /><span>Stop</span>
        {:else}
          <Send size={16} /><span>{sendLabel}</span>
        {/if}
      </button>
    </div>
  </div>

  <div class="ega-task-chips">
    <TaskPicker bind:task views={taskViews} />
  </div>

  <!-- Kept out of TaskPicker so it sits below the task chips. -->
  {#if usesTone}
    <label class="ega-tone-row">
      <span class="tone-lbl">Tone</span>
      <Select
        bind:value={tone}
        options={toneOptions}
        size="sm"
        ariaLabel="Tone"
        selectClass="tone-select"
        selectAttrs={{ 'data-ega-tone-select': '' }}
      />
    </label>
  {/if}

  <!-- Value resets after each pick so re-selecting the same file refires the change event. -->
  <input
    type="file"
    accept="image/*"
    data-ega-image-input
    bind:this={imageInputEl}
    onchange={(e) => {
      void ingestImageList(e.currentTarget.files);
      e.currentTarget.value = '';
    }}
    hidden
  />
</div>

<style>
  .ega-input-row {
    display: flex;
    flex-direction: column;
    /* Fixed chrome: shrinking it spills the send row over the task chips. */
    flex: 0 0 auto;
    gap: var(--space-2);
    /* The header rule bleeds to the panel edge, so this one does too; the shell padding is added back inside. */
    margin-inline: calc(-1 * var(--card-pad));
    padding: var(--space-3) calc(var(--space-3) + var(--card-pad));
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-bg);
    transition: background var(--motion-fast) var(--ease-out);
  }
  .ega-input-row.drag-active {
    background: var(--color-accent-bg-soft);
    outline: 2px dashed var(--color-accent);
    outline-offset: -2px;
  }
  .ega-input-row.drag-active .ega-input-box {
    background: var(--color-accent-bg-soft);
    outline: 2px dashed var(--color-accent);
    outline-offset: -2px;
  }
  .ega-meta-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .ega-char-count {
    margin-left: auto;
    align-self: center;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ega-char-count.over {
    color: var(--color-danger-fg);
  }
  .ega-lang-pair {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
  }
  /* Same shape as PopupLangPair: the picker fills its share instead of clipping the label. */
  .ega-lang-pair :global(.ega-lang-picker) {
    flex: 1 1 100px;
  }
  .ega-lang-pair .swap {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    width: 32px;
    height: 32px;
    cursor: pointer;
    color: var(--color-fg);
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ega-lang-pair .swap:hover:not([aria-disabled='true']) {
    background: var(--color-bg-sunken);
  }
  .ega-lang-pair .swap[aria-disabled='true'] {
    background: var(--color-bg-disabled);
    color: var(--color-fg-disabled);
    border-color: var(--color-border-disabled);
    cursor: var(--cursor-disabled);
  }
  .ega-attached-image {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  /* The box owns the frame so Attach, Dictate and Send sit inside the edge of the text. */
  .ega-input-box {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .ega-input-box:has(.ega-input-textarea:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .ega-input-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    background: transparent;
    color: var(--color-fg);
    font: inherit;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    resize: vertical;
    field-sizing: content;
    outline: none;
    /* Two rows at rest, six before it scrolls: the send row must stay on screen at 380px. */
    min-height: calc(2 * var(--lh-body) * var(--fs-sm) + 2 * var(--space-2));
    max-height: calc(6 * var(--lh-body) * var(--fs-sm) + 2 * var(--space-2));
    overflow-y: auto;
  }
  /* :global — svelte cannot see an inline style the template never writes. An inline height means
     the user dragged the grip, and the six-row cap is meant for auto-growth only. */
  .ega-input-row :global(.ega-input-textarea[style*='height']) {
    max-height: none;
  }
  .ega-task-chips {
    /* Three chip rows, then scroll: a long custom task list must not push the textarea off screen. */
    max-height: 96px;
    overflow-y: auto;
  }
  .ega-tone-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ega-tone-row .tone-lbl {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ega-tone-row :global(.ega-select-wrap) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ega-tone-row :global(.tone-select) {
    width: 100%;
    min-width: 0;
  }
  .ega-send-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1) var(--space-1);
  }
  .ega-send-row .ega-send {
    margin-left: auto;
  }
  .ega-char-count + .ega-send {
    margin-left: var(--space-2);
  }
  .ega-send {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    cursor: pointer;
    font-size: var(--fs-sm);
    font-weight: 500;
  }
  .ega-send::before {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 0;
    height: 1px;
    background: var(--color-accent-fg);
    opacity: 0.6;
    transform: translateX(-50%);
    transition: width var(--motion-base) var(--ease-out);
  }
  .ega-send:focus-visible::before {
    width: calc(100% - var(--space-3) * 2);
  }
  @media (prefers-reduced-motion: reduce) {
    .ega-send::before {
      transition: none;
    }
  }
  .ega-send:disabled {
    background: var(--color-bg-disabled);
    border-color: var(--color-border-disabled);
    color: var(--color-fg-disabled);
    cursor: not-allowed;
  }
  .ega-send.danger {
    background: transparent;
    color: var(--color-danger-fg);
    border-color: var(--color-danger);
  }
  .ega-send:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .ega-mic-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    width: 32px;
    height: 32px;
    cursor: pointer;
    color: var(--color-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .ega-mic-btn[aria-pressed='true'] {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
</style>
