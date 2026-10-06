<script lang="ts">
  import { tick } from 'svelte';
  import { DropdownMenu } from 'bits-ui';
  import { debugCatch } from '@/shared/logger';
  import { toastStore } from '@/shared/components/toastStore';
  import Icon from '@/shared/ui/Icon.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import X from '@lucide/svelte/icons/x';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import CircleStop from '@lucide/svelte/icons/circle-stop';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import Plus from '@lucide/svelte/icons/plus';
  import Mic from '@lucide/svelte/icons/mic';
  import Pencil from '@lucide/svelte/icons/pencil';
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { Variety } from '@/shared/types';
  import type { Tone } from '@/shared/task-prompts';
  import { SHIPPED_TASK_VIEWS, taskLabel, type TaskId, type TaskView } from '@/shared/task-view';
  import { chatContextLabel, CHAT_HISTORY_TOKEN_BUDGET } from '@/shared/chat-history';
  import { MAX_SELECTION_CHARS } from '@/shared/constants';
  import { attachedImageProblem } from '@/shared/image-url-guard';
  import { isIsoCode, labelFor } from '@/shared/languages';
  import { replyLang } from '@/shared/lang-tag';
  import type { ConversationTurnLike } from '@/shared/chat-history';
  import { modeChipLabel, swapResult, type ComposerMode } from '../state/thread-view';
  import ModePopover from './ModePopover.svelte';

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
    task: TaskId;
    tone: Tone;
    /** The task's prompt has a {{tone}} slot, so the tone select shows. */
    usesTone: boolean;
    /** Every task, on or off; the popover offers the ones that are on. */
    taskViews?: readonly TaskView[] | undefined;
    varieties: Variety[];
    pageContextLevel: 'minimal' | 'rich';
    /** Page info is on in Settings. */
    contextEnabled?: boolean;
    /** Page info goes with the next send: it is on, the task sends it, and the open conversation is the tab's site. */
    pageInfoGoes: boolean;
    /** The newest reply's detected language, so swap can work from Auto-detect. */
    detectedLang?: string | undefined;
    onOpenSettings: () => void;
    attachedImage: string | null;
    /** True while a reply runs: Send becomes Stop. */
    inflight: boolean;
    /** Prior conversation turns, for the earlier-messages count. */
    turns: readonly ConversationTurnLike[];
    mode: ComposerMode;
    onCancelMode: () => void;
    onContextLevelChange: (level: 'minimal' | 'rich') => void;
    onAttachImage: (dataUrl: string) => void;
    onClearAttachedImage: () => void;
    onSend: () => void;
    onCancel: () => void;
  }

  let {
    value = $bindable(),
    sourceLang = $bindable(),
    targetLang = $bindable(),
    task = $bindable(),
    usesTone,
    taskViews = SHIPPED_TASK_VIEWS,
    tone = $bindable(),
    varieties,
    pageContextLevel,
    contextEnabled = true,
    pageInfoGoes,
    detectedLang,
    onOpenSettings,
    attachedImage,
    inflight,
    turns,
    mode,
    onCancelMode,
    onContextLevelChange,
    onAttachImage,
    onClearAttachedImage,
    onSend,
    onCancel,
  }: Props = $props();

  let dragActive = $state(false);
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let imageInputEl: HTMLInputElement | null = $state(null);
  let chipEl: HTMLButtonElement | null = $state(null);
  let modeOpen = $state(false);
  let recognizing = $state(false);
  let listening = $state('');
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
      return;
    }
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
    listening = 'Listening…';
  }

  const langName = (id: string): string =>
    varieties.find((v) => v.id === id)?.label ?? labelFor(id);

  const currentView = $derived(taskViews.find((v) => v.id === task));
  // A task that takes no images sends an attached one to the image reader, as Translate.
  const imageToTranslate = $derived(attachedImage !== null && !(currentView?.image ?? false));
  const imageBlocked = $derived<ReadonlySet<TaskId> | null>(
    attachedImage === null ? null : new Set(taskViews.filter((v) => !v.image).map((v) => v.id)),
  );
  const chipLabel = $derived(
    modeChipLabel({
      taskLabel: taskLabel(taskViews, task),
      answersInTarget: replyLang(task, 'target', 'source') === 'target',
      source: sourceLang === 'auto' ? undefined : langName(sourceLang),
      target: langName(targetLang),
      tone: usesTone ? tone : undefined,
      imageToTranslate,
    }),
  );
  const chipName = $derived(`${chipLabel.replaceAll('→', 'to')}, change task and language`);
  const swap = $derived(
    swapResult(
      sourceLang,
      targetLang,
      detectedLang !== undefined && isIsoCode(detectedLang) ? detectedLang : undefined,
    ),
  );

  // An image send carries no history, so the count would promise context that is not sent.
  const historyLabel = $derived(
    attachedImage
      ? null
      : (chatContextLabel(turns, { budgetTokens: CHAT_HISTORY_TOKEN_BUDGET })?.replace(
          /^Using /,
          '',
        ) ?? null),
  );

  // The service worker cuts anything past the cap, so the composer stops it here.
  const overCap = $derived(value.length > MAX_SELECTION_CHARS);
  const nearCap = $derived(value.length > MAX_SELECTION_CHARS * 0.8);
  const count = (n: number): string => n.toLocaleString('en-US');
  const ready = $derived((value.trim() !== '' || attachedImage !== null) && !overCap);
  const placeholder = $derived(
    mode.kind === 'refine'
      ? 'Describe the change'
      : attachedImage
        ? 'Add a note (optional)'
        : 'Type, paste, or drop an image',
  );

  function trySend(): void {
    if (inflight) {
      // Send turned into Stop, which is not feedback on this key press.
      toastStore.push({ message: 'Wait for this reply, or press Stop.', variant: 'warning' });
      return;
    }
    if (ready) onSend();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      trySend();
      return;
    }
    if (e.key === 'Escape') {
      if (inflight) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      // Otherwise let it propagate: the window handler leaves edit or refine mode.
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
    const target = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (!target) {
      toastStore.push({ message: 'Only images can be attached.', variant: 'warning' });
      return;
    }
    try {
      attach(await fileToDataUrl(target));
    } catch (e) {
      debugCatch(e, 'sidepanel.conversation.InputRow.ingest');
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
    // Image files win (one image per message), but the text half is not dropped in silence.
    if (files.some((f) => f.type.startsWith('image/'))) {
      void ingestImageList(dt.files);
      if (text.trim()) {
        toastStore.push({
          message: 'Image attached. The dropped text was ignored.',
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
    // Office apps put the selected text AND a picture of it on the clipboard; the text is what the user chose.
    if (cd.getData('text/plain').trim()) return;
    for (const item of Array.from(cd.items)) {
      if (!item.type.startsWith('image/')) continue;
      const f = item.getAsFile();
      if (!f) continue;
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
</script>

<!-- The whole composer is the drop target; only the box shows it. -->
<div
  class="ega-composer"
  role="presentation"
  data-ega-composer
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  <div class="ega-row-a" role="group" aria-label="Next message">
    {#if mode.kind === 'send'}
      <button
        bind:this={chipEl}
        type="button"
        class="ega-mode-chip"
        aria-label={chipName}
        aria-haspopup="dialog"
        aria-expanded={modeOpen}
        data-ega-mode-chip
        onclick={() => (modeOpen = !modeOpen)}
      >
        <span class="ega-mode-chip-text" data-ega-user-name>{chipLabel}</span>
        <span class="ega-mode-chip-chevron" class:open={modeOpen}
          ><Icon icon={ChevronDown} size={16} /></span
        >
      </button>
    {:else}
      <span class="ega-mode-banner" data-ega-mode-banner>
        <Icon icon={mode.kind === 'edit' ? Pencil : WandSparkles} size={16} />
        <span>{mode.kind === 'edit' ? 'Editing your message' : 'Changing this reply'}</span>
        <button
          type="button"
          class="ega-mode-banner-x"
          aria-label={mode.kind === 'edit' ? 'Cancel editing' : 'Cancel change'}
          data-tooltip={mode.kind === 'edit' ? 'Cancel editing (Esc)' : 'Cancel change (Esc)'}
          data-tooltip-placement="top"
          onclick={onCancelMode}><Icon icon={X} size={16} /></button
        >
      </span>
    {/if}
    {#if mode.kind !== 'refine' && (pageInfoGoes || historyLabel !== null || attachedImage)}
      <span class="ega-next-send" data-ega-next-send>
        {#if pageInfoGoes}<span class="ega-next-item">Page info</span>{/if}
        {#if historyLabel !== null}<span class="ega-next-item">{historyLabel}</span>{/if}
        {#if attachedImage}
          <span class="ega-next-item ega-next-image">
            <img src={attachedImage} alt="Attachment" class="ega-next-thumb" />
            <span aria-hidden="true">Image</span>
            <IconButton
              icon={X}
              ariaLabel="Remove image"
              size="sm"
              dataAttrs={{ 'data-ega-chip-remove': 'true' }}
              onclick={onClearAttachedImage}
            />
          </span>
        {/if}
      </span>
    {/if}
  </div>

  <div class="ega-input-box" class:drag-active={dragActive}>
    {#if SpeechRecognitionCtor && !recognizing}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="ega-icon-btn variant-default size-md"
          aria-label="Add"
          data-tooltip="Attach or dictate"
          data-tooltip-placement="top"
          data-ega-add
        >
          <Icon icon={Plus} size={16} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="sp-menu" side="top" align="start" sideOffset={6}>
            <DropdownMenu.Item
              class="sp-menu-item"
              onSelect={() => imageInputEl?.click()}
              data-ega-attach-image
            >
              <Icon icon={Paperclip} size={16} />
              <span class="sp-menu-label">Attach image…</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item class="sp-menu-item" onSelect={toggleDictation} data-ega-mic>
              <Icon icon={Mic} size={16} />
              <span class="sp-menu-label">Dictate in {dictationLabel}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {:else if recognizing}
      <button
        type="button"
        class="ega-icon-btn variant-default size-md ega-dictating"
        aria-label="Stop dictation"
        data-tooltip="Stop dictation"
        data-tooltip-placement="top"
        data-ega-add
        data-ega-mic
        onclick={toggleDictation}
      >
        <Icon icon={CircleStop} size={16} />
      </button>
    {:else}
      <button
        type="button"
        class="ega-icon-btn variant-default size-md"
        aria-label="Attach image"
        data-tooltip="Attach image"
        data-tooltip-placement="top"
        data-ega-add
        data-ega-attach-image
        onclick={() => imageInputEl?.click()}
      >
        <Icon icon={Paperclip} size={16} />
      </button>
    {/if}

    <!-- dir=auto: Hebrew, Arabic or Arabizi typed here must align by its own first strong character. -->
    <textarea
      id="sp-text"
      class="ega-input-textarea"
      dir="auto"
      aria-label="Message"
      aria-describedby={overCap ? 'sp-count' : undefined}
      {placeholder}
      rows="1"
      bind:this={textareaEl}
      bind:value
      onkeydown={handleKeyDown}
      onpaste={handlePaste}></textarea>

    <!-- One element across the swap: with two buttons, pressing Send would unmount the focused node. -->
    <button
      type="button"
      class="ega-send"
      class:stop={inflight}
      class:not-ready={!inflight && !ready}
      aria-label={inflight ? 'Stop' : 'Send'}
      aria-disabled={!inflight && !ready ? 'true' : undefined}
      aria-describedby={!inflight && !ready ? (overCap ? 'sp-count' : 'sp-send-why') : undefined}
      data-tooltip={inflight ? 'Stop (Esc)' : 'Send (Enter)'}
      data-tooltip-placement="top-end"
      data-ega-send
      onclick={() => {
        if (inflight) onCancel();
        else if (ready) onSend();
        // The next message is typed in the box, so focus goes there, not to a button that changed meaning.
        textareaEl?.focus();
      }}
    >
      <Icon icon={inflight ? CircleStop : ArrowUp} size={16} />
    </button>
    <span class="ega-sr-only" id="sp-send-why">Type a message first</span>
  </div>

  {#if nearCap}
    <p class="ega-char-count" class:over={overCap} id="sp-count" aria-live="polite">
      {count(value.length)} / {count(MAX_SELECTION_CHARS)}{overCap
        ? ` · ${count(value.length - MAX_SELECTION_CHARS)} too many`
        : ''}
    </p>
  {/if}
  <span class="ega-sr-only" role="status" aria-live="polite">{recognizing ? listening : ''}</span>

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

{#if mode.kind === 'send'}
  <ModePopover
    open={modeOpen}
    anchor={chipEl}
    onClose={() => (modeOpen = false)}
    bind:task
    bind:sourceLang
    bind:targetLang
    bind:tone
    {taskViews}
    {varieties}
    {usesTone}
    {swap}
    {imageBlocked}
    {contextEnabled}
    taskSendsPage={currentView?.pageContext ?? false}
    {pageContextLevel}
    {onContextLevelChange}
    onOpenSettings={() => {
      modeOpen = false;
      onOpenSettings();
    }}
  />
{/if}

<style>
  .ega-composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 0 0 auto;
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-bg);
  }
  .ega-row-a {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 28px;
  }
  .ega-mode-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    min-block-size: 28px;
    box-sizing: border-box;
    padding: 0 var(--space-1) 0 var(--space-2);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    font-weight: 400;
    line-height: var(--lh-body);
    text-align: start;
    cursor: pointer;
  }
  .ega-mode-chip:hover {
    background: var(--color-bg-hover);
  }
  .ega-mode-chip[aria-expanded='true'] {
    border-color: var(--color-accent);
  }
  .ega-mode-chip:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  /* The label wraps inside the chip rather than being cut; only a long custom name may end in an ellipsis. */
  .ega-mode-chip-text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .ega-mode-chip-chevron {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-muted);
  }
  .ega-mode-chip-chevron.open {
    transform: rotate(180deg);
  }
  .ega-mode-banner {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: 28px;
    padding: 0 0 0 var(--space-2);
    border-radius: var(--radius-md);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent-hover);
    font-size: var(--fs-sm);
  }
  .ega-mode-banner-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .ega-mode-banner-x:hover {
    background: var(--color-bg-hover);
  }
  .ega-mode-banner-x:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  .ega-next-send {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .ega-next-item + .ega-next-item::before {
    content: '·';
    padding-inline: var(--space-1);
  }
  .ega-next-image {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .ega-next-thumb {
    inline-size: 24px;
    block-size: 24px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }
  .ega-input-box {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
  }
  .ega-input-box:has(.ega-input-textarea:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .ega-input-box.drag-active {
    background: var(--color-accent-bg-soft);
    outline: 2px dashed var(--color-accent);
    outline-offset: -2px;
  }
  .ega-input-textarea {
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--space-1) var(--space-2);
    border: 0;
    background: transparent;
    color: var(--color-fg);
    font: inherit;
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    resize: none;
    field-sizing: content;
    outline: none;
    /* One line at rest, six before it scrolls. */
    min-block-size: 32px;
    max-block-size: calc(6 * var(--lh-body) * var(--fs-md) + 2 * var(--space-1));
    overflow-y: auto;
  }
  .ega-input-textarea::placeholder {
    color: var(--color-placeholder);
  }
  .ega-dictating {
    color: var(--color-danger-fg);
  }
  .ega-send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-accent-fg);
    cursor: pointer;
  }
  .ega-send:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-send.not-ready {
    border-color: transparent;
    background: var(--color-bg-disabled);
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  .ega-send.stop {
    border-color: var(--color-control-border);
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .ega-char-count {
    margin: 0;
    text-align: end;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ega-char-count.over {
    color: var(--color-danger-fg);
  }
  @media (forced-colors: active) {
    .ega-mode-chip,
    .ega-input-box,
    .ega-send {
      border-color: ButtonText;
    }
  }
</style>
