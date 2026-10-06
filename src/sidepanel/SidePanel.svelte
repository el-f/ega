<script lang="ts">
  // Shell only. Every interaction is a turn; `state/conversation.svelte.ts` owns
  // dispatch and chunk routing.

  import { onDestroy, onMount, tick } from 'svelte';
  import { getCustomTasks, getSettings, onSettingsChanged } from '@/shared/storage';
  import type { Settings } from '@/shared/types';
  import { asLangSelection } from '@/shared/brands';
  import {
    DEFAULT_CONFIDENCE_PILL_THRESHOLD,
    IMAGE_TURN_PLACEHOLDER,
    settingsSaveFailedMessage,
    STORAGE_KEYS,
  } from '@/shared/constants';
  import { openOptionsTab } from '@/shared/open-options-tab';
  import { loadMarkdownRenderer } from '@/shared/components/markdown-loader';
  import { PENDING_POPUP_HANDOFF_KEY } from '@/shared/pending-popup-handoff';
  import { applyTheme, type ThemePref } from '@/shared/theme';
  import ToastHost from '@/shared/components/ToastHost.svelte';
  import CommandPalette from '@/shared/components/CommandPalette.svelte';
  import ShortcutOverlay from '@/shared/components/ShortcutOverlay.svelte';
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import ActiveBackendChip from '@/shared/components/ActiveBackendChip.svelte';
  import HeaderMoreMenu from './HeaderMoreMenu.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Popover from '@/shared/ui/Popover.svelte';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import SquarePenIcon from '@lucide/svelte/icons/square-pen';
  import SearchIcon from '@lucide/svelte/icons/search';
  import XIcon from '@lucide/svelte/icons/x';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { buildRegistry, type Command } from '@/shared/command-registry';
  import { listVarieties } from '@/shared/varieties';
  import type { Variety } from '@/shared/types';
  import { sendTabMsg } from '@/shared/messages';
  import AppShell from '@/shared/ui/AppShell.svelte';
  import { builtInTask, runnableDefaultTask, type Tone } from '@/shared/task-prompts';
  import { findTask, materializeTasks, type TaskId } from '@/shared/task-view';
  import { taskUsesTone } from '@/shared/language-prompt';
  import type { CustomTask } from '@/shared/settings-schema';
  import ConversationStream from './conversation/ConversationStream.svelte';
  import InputRow from './conversation/InputRow.svelte';
  import { createConversation } from './state/conversation.svelte';
  import { createIntake } from './state/intake';
  import { INDEX_KEY } from './state/conversation-store';
  import { visibleTurns, searchTurns } from './state/conversation';
  import { exportMarkdown, exportJson } from './state/conversation-export';
  import { getActiveOrigin, getPanelWindowId, startOriginFollower } from './state/active-origin';
  import {
    clearComposerDraft,
    clearComposerDraftImage,
    pruneOrphanDrafts,
    readComposerDraft,
    readComposerDraftImage,
    writeComposerDraft,
    writeComposerDraftImage,
  } from './state/composer-draft';
  import { debugCatch } from '@/shared/logger';
  import { toastStore } from '@/shared/components/toastStore';
  import { patchSettings } from '@/shared/settings-bus';
  import { imageStuckTimeoutMs, stuckTimeoutMs } from '@/shared/stuck-timeout';
  import type { PageContext } from '@/shared/types';

  // Same ceilings as the tooltip's stuck guard, read at dispatch so a settings edit applies to the next send.
  const conversation = createConversation({
    stallMs: (hasImage) => (hasImage ? imageStuckTimeoutMs(settings) : stuckTimeoutMs(settings)),
  });

  let varieties: Variety[] = $state([]);
  let sourceText = $state('');
  let sourceLang = $state<string>('auto');
  let targetLang = $state<string>('en');
  let task = $state<TaskId>('translate');
  let tone = $state<Tone>('neutral');
  let streamingPref = $state<boolean>(true);
  let pageContextLevel = $state<'minimal' | 'rich'>('minimal');
  let attachedImage = $state<string | null>(null);
  let focusedTurnId = $state<string | null>(null);
  // The id, not a flag: a tab switch swaps the thread, so "drop the last exchange" would hit another site's turns.
  let editingTurnId = $state<string | null>(null);

  // Reported by the backend chip, which already resolves the chain and probes the key-less backends.
  let backendReady = $state<boolean | null>(null);
  let bookmarkFilter = $state(false);
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let searchInputEl: HTMLInputElement | null = $state(null);

  // A new exchange is never bookmarked and never matches the old query, so either filter would hide the answer.
  // Escape, the X and the header magnifier are one action; focus returns to the toggle.
  function closeSearch(): void {
    searchQuery = '';
    searchOpen = false;
    document.querySelector<HTMLElement>('[data-ega-search-toggle]')?.focus();
  }

  async function toggleSearch(): Promise<void> {
    if (searchOpen) {
      closeSearch();
      return;
    }
    searchOpen = true;
    await tick();
    searchInputEl?.focus();
  }

  function clearFilters(): void {
    bookmarkFilter = false;
    searchQuery = '';
    searchOpen = false;
  }

  // Refreshed on storage change, so the backend chip tracks pinning writes made on another surface.
  let settings = $state<Settings | null>(null);
  // Custom task rows live in their own storage key; the panel re-reads them when they change.
  let customTasks = $state<CustomTask[]>([]);
  const taskViews = $derived(settings ? materializeTasks(settings, customTasks) : undefined);
  const takesImage = $derived(
    taskViews?.find((v) => v.id === task)?.image ?? (task === 'translate' || task === 'explain'),
  );
  // An attached image takes the OCR arm unless the task reads images itself; that prompt has no tone, so none is shown or sent.
  const usesTone = $derived(
    !(attachedImage && (task === 'translate' || !takesImage)) &&
      (settings ? taskUsesTone(settings, customTasks, task, sourceLang) : task === 'reword'),
  );
  function loadCustomTasks(): void {
    void getCustomTasks()
      .then((rows) => {
        customTasks = rows;
      })
      .catch((e: unknown) => debugCatch(e, 'sidepanel.loadCustomTasks'));
  }
  let settingsUnsub: (() => void) | null = null;
  // Resolved after mount; undefined until then, and every window check fails open on undefined.
  let panelWindowId: number | undefined;
  /** advanced.retryCount, editable here without opening Settings; saved through the settings bus like any setting. */
  let retryCount = $state<number>(1);
  let retryAnchor: HTMLElement | null = $state(null);
  let retryPopoverOpen = $state<boolean>(false);

  // Composer swap only. A reply's Re-run as menu swaps a past turn, so it gates on that turn, not the picker.
  const swapDisabled = $derived(sourceLang === 'auto');
  const latestTurnId = $derived(conversation.turns.at(-1)?.id ?? null);
  const turnSwapPair = $derived(latestTurnId === null ? null : conversation.swapPair(latestTurnId));
  const hasInflight = $derived(conversation.inflightId !== null);
  // One gate for New and both export items: disabled until there is a thread.
  const isEmptyThread = $derived(conversation.turns.length === 0);

  const baseTurns = $derived(visibleTurns(conversation.turns, bookmarkFilter));
  const filteredTurns = $derived(searchTurns(baseTurns, searchQuery));
  const matchCount = $derived(
    searchQuery.trim() ? filteredTurns.filter((t) => t.role === 'user').length : 0,
  );
  // Both halves of a bookmarked pair survive the filter, so counting turns would say "2" for one message.
  const bookmarkCount = $derived(baseTurns.filter((t) => t.role === 'user').length);
  const emptySearch = $derived(searchQuery.trim().length > 0 && filteredTurns.length === 0);
  const emptyBookmarkFilter = $derived(
    !searchQuery.trim() && bookmarkFilter && baseTurns.length === 0,
  );
  /** What the stream's announcer reads out when a filter narrows the thread. */
  const filterSummary = $derived.by(() => {
    if (searchQuery.trim()) return `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`;
    if (bookmarkFilter)
      return `${bookmarkCount} ${bookmarkCount === 1 ? 'message' : 'messages'} bookmarked`;
    return null;
  });

  function onSwap(): void {
    const ns = targetLang;
    targetLang = sourceLang;
    sourceLang = ns;
  }

  /** One re-translate per settled pick: keyboard-scrolling the target list must not fire one dispatch per option. */
  const TARGET_CHANGE_DEBOUNCE_MS = 500;
  let targetChangeTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelPendingTargetChange(): void {
    if (targetChangeTimer !== null) clearTimeout(targetChangeTimer);
    targetChangeTimer = null;
  }
  function onTargetChange(): void {
    cancelPendingTargetChange();
    targetChangeTimer = setTimeout(() => {
      targetChangeTimer = null;
      void conversation.langVariant(asLangSelection(targetLang));
    }, TARGET_CHANGE_DEBOUNCE_MS);
  }

  /** Adds a sibling variant and re-sends with the refinement for this request only; it is never written to settings. */
  async function onRefine(args: {
    turnId: string;
    refinementBody: string;
    refinementLabel?: string;
  }): Promise<boolean> {
    return conversation.refine({
      turnId: args.turnId,
      refinementBody: args.refinementBody,
      ...(args.refinementLabel !== undefined ? { refinementLabel: args.refinementLabel } : {}),
    });
  }

  // All sidepanel settings writes go through the SW (settings:update), so one
  // realm owns the read-modify-write and a concurrent options/content write cannot be lost.
  /** A rejected write must not leave the panel showing a value nothing stored, so `revert` puts the control back. */
  async function commitSettings(patch: Partial<Settings>, revert: () => void): Promise<void> {
    const ack = await patchSettings(patch);
    if (ack.ok) return;
    revert();
    toastStore.push({ message: settingsSaveFailedMessage(ack.reason), variant: 'danger' });
  }

  async function setPageContextLevel(level: 'minimal' | 'rich'): Promise<void> {
    const previous = pageContextLevel;
    pageContextLevel = level;
    await commitSettings({ pageContextLevel: level }, () => (pageContextLevel = previous));
  }

  async function collectActiveTabContext(): Promise<PageContext | null> {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) return null;
      const level = pageContextLevel ?? 'minimal';
      const reply = await sendTabMsg(tabId, { kind: 'ega:get-page-context', level });
      return reply?.context ?? null;
    } catch (e) {
      debugCatch(e, 'sidepanel.collectActiveTabContext');
      return null;
    }
  }

  /** `contextEnabled` and the task's own switch both gate it; the turn stores what was sent, so a later switch change cannot rewrite it. */
  async function currentPageContext(taskId: TaskId): Promise<PageContext | null> {
    const taskSendsIt = taskViews?.find((v) => v.id === taskId)?.pageContext ?? true;
    return settings?.contextEnabled && taskSendsIt ? await collectActiveTabContext() : null;
  }

  // inflightId only flips after the context-collection await, so a fast double send would dispatch twice.
  let sending = false;

  async function sendTurn(): Promise<void> {
    const text = sourceText.trim();
    if (!text && !attachedImage) return;
    if (sending || conversation.inflightId !== null) return;
    sending = true;
    clearFilters();
    try {
      // Read the page before touching the thread, and bail if the thread moved meanwhile: the edit belongs to the site it was typed on.
      const originBefore = conversation.activeOrigin;
      // The OCR prompt reads only the image, so that arm sends and records no page context.
      const toOcr = attachedImage !== null && (task === 'translate' || !takesImage);
      const context = toOcr ? undefined : await currentPageContext(task);
      if (conversation.activeOrigin !== originBefore) return;
      // The previous turn is in the composer, so drop it or the re-send appends a duplicate.
      let preservedResponse: string | undefined;
      if (editingTurnId !== null) {
        if (conversation.lastUserTurn()?.id === editingTurnId) {
          const prior = conversation.turns.find(
            (t) => t.role === 'assistant' && t.attachedToTurnId === editingTurnId,
          );
          if (prior?.status === 'done' && prior.content) preservedResponse = prior.content;
          conversation.dropLastUserExchange();
        }
        editingTurnId = null;
        draftBeforeEdit = '';
      }
      const content = text || IMAGE_TURN_PLACEHOLDER;
      // 'explain' keeps its own kind so the router takes the vision-explain arm instead of plain OCR.
      // A custom task runs under kind translate and keeps its id; an image always takes the image arm.
      const builtIn = builtInTask(task);
      const img = attachedImage;
      // An image goes to the OCR arm for Translate and for any task that takes no images; Explain and image-taking custom tasks send their own prompt.
      const ocr = img !== null && (task === 'translate' || !takesImage);
      const kind = ocr ? 'image-translate' : (builtIn ?? 'translate');
      await conversation.send({
        content,
        kind,
        ...(builtIn === null && !ocr ? { taskId: task } : {}),
        ...(preservedResponse !== undefined ? { preservedResponse } : {}),
        ...(img ? { imageDataUrl: img } : {}),
        sourceLang: asLangSelection(sourceLang),
        targetLang: asLangSelection(targetLang),
        stream: streamingPref,
        ...(usesTone ? { tone } : {}),
        ...(context !== undefined ? { context } : {}),
      });
      sourceText = '';
      attachedImage = null;
      void clearComposerDraftImage();
    } finally {
      sending = false;
    }
  }

  function cancelInflight(): void {
    conversation.cancel();
  }

  /** Aborts in-flight translates from every surface (tooltip, popup, batch). */
  function cancelAllInflight(): void {
    chrome.runtime.sendMessage({ kind: 'translate:cancel-all' }).catch(() => {
      /* SW asleep — no in-flight to cancel anyway. */
    });
    // Cancel local conversation too so the sidepanel's own turns transition
    // out of streaming state without waiting for the SW round-trip.
    conversation.cancel();
  }

  /** Composer text the edit replaced, so Escape puts it back instead of clearing to ''. */
  let draftBeforeEdit = '';

  function focusComposer(): void {
    document.getElementById('sp-text')?.focus();
  }

  function attachComposerImage(dataUrl: string): void {
    attachedImage = dataUrl;
    void writeComposerDraftImage(dataUrl).then((kept) => {
      if (!kept) {
        toastStore.push({
          message: 'That image is too large to keep if you close the panel.',
          variant: 'warning',
        });
      }
    });
  }

  // Called from the window keydown handler when focus is on the stream and the user presses 'e'.
  function pullLastUserTurnIntoInput(): void {
    if (conversation.inflightId !== null) {
      toastStore.push({ message: 'Edit when this reply finishes.', variant: 'warning' });
      return;
    }
    if (editingTurnId !== null) return;
    const last = conversation.lastUserTurn();
    if (!last) return;
    // The pencil is hidden for image turns, but 'e' does not go through it.
    // Keyed on the image, not the kind: an Explain send carries one too.
    if (last.hasImage) {
      toastStore.push({
        message: 'An image message cannot be edited. Send the image again to change it.',
        variant: 'warning',
      });
      return;
    }
    // 'e' is one bare keypress; it must not silently replace something the user typed.
    if (sourceText.trim() && sourceText !== last.content) {
      toastStore.push({
        message: 'Clear the message box first to edit your last message.',
        variant: 'warning',
      });
      return;
    }
    draftBeforeEdit = sourceText;
    sourceText = last.content;
    editingTurnId = last.id;
  }

  // A mid-history turn needs a confirm before truncating; the last turn reuses pullLastUserTurnIntoInput.
  async function onEditTurn(turnId: string): Promise<void> {
    if (conversation.inflightId !== null) return;
    const userTurns = conversation.turns.filter((t) => t.role === 'user');
    const lastUserTurn = userTurns[userTurns.length - 1];
    if (turnId === lastUserTurn?.id) {
      pullLastUserTurnIntoInput();
      return;
    }
    const turnIdx = conversation.turns.findIndex((t) => t.id === turnId);
    if (turnIdx === -1) return;
    const later = conversation.turns.length - turnIdx - 1;
    const ok = await confirmDialog({
      title: 'Edit message',
      body: `Edit this message? This removes the ${later} later message${later === 1 ? '' : 's'}.`,
      confirmLabel: 'Edit',
      danger: true,
    });
    if (!ok) return;
    const text = conversation.editFrom(turnId);
    if (text === null) return;
    sourceText = text;
    editingTurnId = null;
    await tick();
    focusComposer();
  }

  const intake = createIntake({
    conversation,
    panelWindowId: () => panelWindowId,
    streaming: () => streamingPref,
    pickers: () => ({ sourceLang, targetLang, task, tone }),
    setPickers: (p) => {
      sourceLang = p.sourceLang;
      targetLang = p.targetLang;
      task = p.task;
      tone = p.tone;
    },
    runnableTask: (id) => {
      const view = settings ? findTask(settings, customTasks, id) : null;
      return view !== null && !view.disabled ? view.id : null;
    },
    pageContext: currentPageContext,
    clearFilters,
    attachImage: (src) => {
      const attach = (): void => {
        attachComposerImage(src);
        void tick().then(focusComposer);
      };
      // An image would turn the edited text into an image send, so the edit stays as it is.
      if (editingTurnId !== null) {
        toastStore.push({
          message: 'The page image was not attached because you are editing a message.',
          variant: 'warning',
        });
        return;
      }
      // The user's own image wins until they say otherwise.
      if (attachedImage !== null && attachedImage !== src) {
        toastStore.push({
          message: 'Replace the attached image with the one from the page?',
          variant: 'info',
          // attach() holds this page image; a late click would replace an image attached since.
          action: { label: 'Replace', onClick: attach, expires: true },
        });
        return;
      }
      attach();
    },
  });

  // One window keydown owner: turn navigation is delegated so no second svelte:window listener is needed.
  let streamKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  let paletteOpen = $state(false);
  let shortcutsOpen = $state(false);
  let paletteCommands: readonly Command[] = $state([]);
  let themePref: ThemePref = $state('system');

  async function setTheme(to: ThemePref): Promise<void> {
    const previous = themePref;
    themePref = to;
    applyTheme(to);
    await commitSettings({ theme: to }, () => {
      themePref = previous;
      applyTheme(previous);
    });
  }

  async function buildPaletteRegistry(): Promise<readonly Command[]> {
    return buildRegistry({
      onOpenOptions: () => openOptionsTab(),
      onSwapTheme: (to) => {
        void setTheme(to);
      },
      onSetBubbleMode: (m) => {
        void commitSettings({ bubbleMode: m }, () => {});
      },
      ...(taskViews ? { tasks: taskViews.filter((v) => !v.disabled) } : {}),
      onSetTask: (t) => {
        task = t;
      },
      onShowShortcuts: () => {
        shortcutsOpen = true;
      },
      // Rebuilt on every Ctrl+K, so a key absent here is an action the header disables right now.
      panelActions: {
        ...(isEmptyThread
          ? {}
          : {
              'conversation.new': () => void onNewConversation(),
              'conversation.export.markdown': () => void copyMarkdown(),
              'conversation.export.json': downloadJson,
            }),
        'conversation.search': () => void toggleSearch(),
        'conversation.bookmarks': () => (bookmarkFilter = !bookmarkFilter),
        ...(hasInflight ? { 'conversation.cancel-all': cancelAllInflight } : {}),
      },
      currentTheme: themePref,
    });
  }

  /** Escape asks before it discards an edit the user changed. */
  async function cancelEditing(): Promise<void> {
    const original = conversation.turns.find((t) => t.id === editingTurnId)?.content ?? '';
    if (sourceText.trim() && sourceText !== original) {
      const ok = await confirmDialog({
        title: 'Discard this edit?',
        body: 'What you typed here is not saved anywhere else.',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
    }
    editingTurnId = null;
    sourceText = draftBeforeEdit;
    draftBeforeEdit = '';
  }

  /** The edit target left the thread. Keep what the user typed — it just sends as a new message now. */
  function detachEdit(): void {
    if (editingTurnId === null) return;
    editingTurnId = null;
    draftBeforeEdit = '';
    toastStore.push({
      message: 'The conversation changed, so your edit will send as a new message.',
      variant: 'warning',
    });
  }

  // A handoff, a seed or another window's turn can land after it, and sendTurn only replaces the last one.
  $effect(() => {
    const last = conversation.lastUserTurn()?.id;
    if (editingTurnId !== null && last !== editingTurnId) detachEdit();
  });

  // A turn that is gone — deleted, or left behind by an origin switch — cannot keep the ring: `r` would act on it.
  $effect(() => {
    const id = focusedTurnId;
    if (id !== null && !conversation.turns.some((t) => t.id === id)) focusedTurnId = null;
  });

  /** Deleting a turn is the only destructive action in the panel with no confirm, so it gets Undo. */
  function onDeleteTurn(turnId: string): void {
    const slice = conversation.deleteTurn(turnId);
    if (!slice || slice.removed.length === 0) return;
    toastStore.push({
      message: slice.removed.length > 1 ? 'Exchange removed.' : 'Message removed.',
      variant: 'info',
      action: {
        label: 'Undo',
        onClick: () => {
          if (!conversation.restoreTurns(slice)) {
            toastStore.push({
              message: 'Cannot undo — this conversation is no longer open.',
              variant: 'warning',
            });
          }
        },
      },
    });
  }

  /** Every bare-key shortcut is off while the user is typing. */
  function isTextEntry(target: EventTarget | null): boolean {
    return (
      // A native select or a bits-ui menu owns its own arrow keys and letter type-ahead; the open refine row keeps its keys too.
      // The reply's action buttons do not: from them j/k/c/e/? stay the panel's navigation; the chip row holds a text field.
      target instanceof HTMLSelectElement ||
      (target instanceof Element &&
        target.closest('[role="menu"], [data-ega-quick-refine]') !== null) ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  // A bits-ui dialog (palette, confirm, shortcut sheet) owns its own keys while it is open.
  function dialogOpen(): boolean {
    return document.querySelector('[role="dialog"]') !== null;
  }

  function onWindowKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && shortcutsOpen) {
      shortcutsOpen = false;
      return;
    }
    // A bits-ui menu or popover already handled this Escape; it must not also cancel the reply.
    if (e.key === 'Escape' && e.defaultPrevented) return;
    if (
      e.key === 'Escape' &&
      editingTurnId !== null &&
      conversation.inflightId === null &&
      !dialogOpen()
    ) {
      void cancelEditing();
      return;
    }
    // A bits-ui dialog owns its own Escape, so one role=dialog query covers palette, sheet and confirm.
    if (e.key === 'Escape' && hasInflight && !isTextEntry(e.target) && !dialogOpen()) {
      e.preventDefault();
      cancelInflight();
      return;
    }
    // The command palette's footer advertises this key, so the panel has to answer it.
    if (e.key === '?' && !isTextEntry(e.target) && !dialogOpen()) {
      e.preventDefault();
      shortcutsOpen = true;
      return;
    }
    const isModK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if (isModK) {
      e.preventDefault();
      void buildPaletteRegistry().then((cmds) => {
        paletteCommands = cmds;
        paletteOpen = true;
      });
      return;
    }
    // A long thread puts ~10 tab stops per exchange between the reader and the message box.
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isTextEntry(e.target) || dialogOpen()) return;
      e.preventDefault();
      focusComposer();
      return;
    }
    // 'e' — edit last user turn. Only fires when focus is OUT of an
    // input/textarea (matches the conversation-stream nav guard).
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isTextEntry(e.target) || dialogOpen()) return;
      e.preventDefault();
      pullLastUserTurnIntoInput();
      return;
    }
    // Turn navigation is delegated to ConversationStream, which owns the turns state these keys read.
    streamKeydownHandler?.(e);
  }

  /** Set once the stored draft is read, so the first render cannot save an empty box over it.
   *  Reactive: text typed during the mount awaits still has to reach storage. */
  let draftHydrated = $state(false);
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const DRAFT_SAVE_DEBOUNCE_MS = 150;

  function saveDraftNow(text: string): void {
    const write = text.length === 0 ? clearComposerDraft() : writeComposerDraft(text);
    write.catch((e: unknown) => debugCatch(e, 'sidepanel.saveDraft'));
  }

  function scheduleDraftSave(): void {
    if (!draftHydrated) return;
    // The composer holds the turn being edited; the stored draft is the text the edit will restore.
    if (editingTurnId !== null) return;
    if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      saveDraftNow(sourceText);
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }

  /** A close inside the debounce window is the exact case the stored draft exists for. */
  function flushDraftSave(): void {
    if (draftSaveTimer === null) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    saveDraftNow(sourceText);
  }

  $effect(() => {
    void sourceText;
    scheduleDraftSave();
  });

  onMount(async () => {
    chrome.runtime.onMessage.addListener(intake.onRuntimeMessage);
    // Warm the marked+dompurify chunk: an answer that finishes before it lands paints as plain text first.
    void loadMarkdownRenderer();
    // The shared subscription drops an older snapshot that resolves after a newer one.
    settingsUnsub = onSettingsChanged(applySettings);
    loadCustomTasks();
    void getPanelWindowId().then((id) => {
      panelWindowId = id;
    });
    try {
      const s = await getSettings();
      applySettings(s);
      // Composer state, seeded once: a later settings change must not reset the pair the user picked.
      sourceLang = s.defaultLang;
      targetLang = s.defaultTargetLang;
      task = runnableDefaultTask(s);
      tone = s.defaultTone;
    } catch (e) {
      debugCatch(e, 'sidepanel.onMount.getSettings');
    }
    // Before the handoff drain: a half-typed thought outranks anything queued for this panel.
    const draft = await readComposerDraft();
    if (draft !== null && sourceText === '') sourceText = draft;
    // The reader applies the same render check the attach paths do, so an http(s) image the page handed over comes back too.
    const draftImage = await readComposerDraftImage();
    if (draftImage !== null && attachedImage === null) attachedImage = draftImage;
    draftHydrated = true;
    void pruneOrphanDrafts();
    try {
      varieties = await listVarieties();
    } catch (e) {
      debugCatch(e, 'sidepanel.onMount.listVarieties');
    }
    // Load the active tab's origin thread first so queued seeds / handoffs
    // append to the restored conversation rather than a blank one.
    try {
      const origin = await getActiveOrigin();
      await conversation.setActiveOrigin(origin);
    } catch (e) {
      debugCatch(e, 'sidepanel.onMount.setActiveOrigin');
    }
    // Registered before the drains below: every await here is a window where a tab switch or a
    // foreign write goes unheard, and the drains are the longest stretch of them.
    if (destroyed) return;
    chrome.storage.onChanged.addListener(onStorageChanged);
    originFollowerUnsub = startOriginFollower((origin) => {
      // A pick that has not fired yet belongs to the thread the user was looking at, not the next one.
      cancelPendingTargetChange();
      void conversation.setActiveOrigin(origin);
    });
    window.addEventListener('pagehide', persistNow);
    try {
      // The drain fails open on an unknown window, so the id is awaited here even though the early lookup usually won.
      if (panelWindowId === undefined) panelWindowId = await getPanelWindowId();
      await intake.drainImageSeeds(panelWindowId);
    } catch (e) {
      debugCatch(e, 'sidepanel.onMount.drainPendingImageSeed');
    }
    await intake.drainPopupHandoffs();
    if (destroyed) return;
    // A fresh panel puts the caret in the box; a restored thread leaves it out, so j/k/e/r still fire.
    const focusedNow = document.activeElement;
    if (
      conversation.turns.length === 0 &&
      conversation.inflightId === null &&
      (focusedNow === null || focusedNow === document.body)
    ) {
      focusComposer();
    }
  });

  // Set true in onDestroy. onMount reads it after each await to skip
  // registering the deferred listeners once teardown has already run.
  let destroyed = false;
  let originFollowerUnsub: (() => void) | null = null;
  function persistNow(): void {
    flushDraftSave();
    // Nothing will render the rest of the stream; stopping it saves a settled turn instead of a loading one.
    if (conversation.inflightId !== null) conversation.cancel();
    conversation.stopBackground();
    conversation.flush().catch((e: unknown) => debugCatch(e, 'sidepanel.persistNow'));
  }

  function onStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ): void {
    if (area === 'session') {
      const change = changes[PENDING_POPUP_HANDOFF_KEY];
      if (change !== undefined && change.newValue !== undefined) {
        void intake.drainPopupHandoffs();
      }
      return;
    }
    if (area !== 'local') return;
    if (STORAGE_KEYS.customTasks in changes) loadCustomTasks();
    conversation.onStorageChanged(changes);
    // "Delete all data" clears storage, and the panel would otherwise write its live thread straight back.
    const indexChange = changes[INDEX_KEY];
    if (indexChange !== undefined && indexChange.newValue === undefined) {
      conversation.resetAfterPurge();
      focusedTurnId = null;
      editingTurnId = null;
    }
  }

  /** The one list of settings this panel mirrors. A field missing here is a
   *  field a second window can silently overwrite. */
  function applySettings(s: Settings): void {
    settings = s;
    themePref = s.theme;
    streamingPref = s.streaming !== false;
    pageContextLevel = s.pageContextLevel;
    retryCount = s.advanced.retryCount;
  }

  onDestroy(() => {
    destroyed = true;
    settingsUnsub?.();
    chrome.runtime.onMessage.removeListener(intake.onRuntimeMessage);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    window.removeEventListener('pagehide', persistNow);
    originFollowerUnsub?.();
    cancelPendingTargetChange();
    // Cancel first so the write records the canceled turn and clears the debounce it schedules.
    conversation.cancel();
    persistNow();
  });

  async function onNewConversation(): Promise<void> {
    if (conversation.turns.length === 0) return;
    const ok = await confirmDialog({
      title: 'New conversation',
      body: 'Start a new conversation? This clears the conversation for this site.',
      confirmLabel: 'Clear & start new',
      danger: true,
    });
    if (!ok) return;
    await conversation.clearActiveThread();
    focusedTurnId = null;
    editingTurnId = null;
    draftBeforeEdit = '';
  }

  function commitRetryCount(next: number): void {
    if (!Number.isInteger(next) || next < 0 || next > 3) return;
    // The slider's oninput already moved the readout; the last saved value is what a failed write rolls back to.
    const previous = settings?.advanced.retryCount ?? retryCount;
    retryCount = next;
    void commitSettings(
      { advanced: { retryCount: next } } as Partial<Settings>,
      () => (retryCount = previous),
    );
  }

  let savingAgain = $state(false);

  /** The toast is gone in 8 seconds; the banner is the only way back once storage has room again. */
  async function retrySave(): Promise<void> {
    savingAgain = true;
    try {
      await conversation.flush();
      toastStore.push({ message: 'Conversation saved.', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'sidepanel.retrySave');
      // The banner stays up either way; without this the second failure looks like a dead button.
      toastStore.push({
        message: conversation.saveFailedQuota
          ? 'Still out of space. Start a new conversation to free some.'
          : 'Still could not save. Try again in a moment.',
        variant: 'danger',
      });
    } finally {
      savingAgain = false;
    }
  }

  async function copyMarkdown(): Promise<void> {
    const md = exportMarkdown(conversation.turns, taskViews);
    try {
      await navigator.clipboard.writeText(md);
      toastStore.push({ message: 'Copied as Markdown', variant: 'success' });
    } catch {
      toastStore.push({ message: 'Could not copy to clipboard', variant: 'danger' });
    }
  }

  function downloadJson(): void {
    const json = exportJson(conversation.turns);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    a.click();
    URL.revokeObjectURL(url);
    toastStore.push({ message: `Saved ${a.download}`, variant: 'success' });
  }

  /** Names the site and the day, so a folder of exports is readable. */
  function exportFileName(): string {
    const site = conversation.activeOrigin
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9.-]/gi, '-')
      .slice(0, 40);
    const day = new Date().toISOString().slice(0, 10);
    return `ega-${site || 'conversation'}-${day}.json`;
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<div class="sp-root">
  <AppShell>
    {#snippet header()}
      <a
        href="#sp-text"
        class="ega-sr-only sp-skip-link"
        data-ega-skip-to-composer
        onclick={(e) => {
          e.preventDefault();
          focusComposer();
        }}>Skip to the message box</a
      >
      <div class="sp-header">
        <h1 class="sp-title"><BrandMark size={16} /></h1>
        <div class="sp-header-spacer"></div>
        <IconButton
          icon={SquarePenIcon}
          ariaLabel="New conversation"
          size="sm"
          disabled={isEmptyThread}
          dataAttrs={{ 'data-ega-new-conversation': 'true' }}
          onclick={() => void onNewConversation()}
        />
        <IconButton
          icon={SearchIcon}
          ariaLabel={searchOpen ? 'Close search' : 'Search conversation'}
          size="sm"
          dataAttrs={{ 'data-ega-search-toggle': 'true', 'aria-pressed': String(searchOpen) }}
          onclick={() => void toggleSearch()}
        />
        {#if settings}
          <ActiveBackendChip
            {settings}
            onJump={() => openOptionsTab('backends')}
            onReadyChange={(ready) => (backendReady = ready)}
          />
        {/if}
        <HeaderMoreMenu
          {isEmptyThread}
          bind:bookmarkFilter
          theme={themePref}
          {retryCount}
          onCancelAll={hasInflight ? cancelAllInflight : undefined}
          bind:trigger={retryAnchor}
          onCopyMarkdown={() => void copyMarkdown()}
          onDownloadJson={downloadJson}
          onSetTheme={(to) => void setTheme(to)}
          onOpenRetry={() => (retryPopoverOpen = true)}
        />
        <Popover
          open={retryPopoverOpen}
          anchor={retryAnchor}
          title="Fallback backends"
          placement="bottom-end"
          onClose={() => (retryPopoverOpen = false)}
        >
          <div class="sp-retry-popover">
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={retryCount}
              aria-label="Fallback backends"
              data-ega-retry-budget
              oninput={(e) => (retryCount = Number((e.currentTarget as HTMLInputElement).value))}
              onchange={(e) =>
                commitRetryCount(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <div class="sp-retry-readout">
              <span class="sp-retry-value">{retryCount}</span>
              <span class="sp-retry-caption">0–3 more backends to try when the first fails</span>
            </div>
          </div>
        </Popover>
        <IconButton
          icon={SettingsIcon}
          ariaLabel="Open settings"
          size="sm"
          onclick={() => openOptionsTab()}
        />
      </div>
      {#if searchOpen}
        <div class="sp-search-bar" role="search">
          <input
            bind:this={searchInputEl}
            bind:value={searchQuery}
            type="search"
            dir="auto"
            aria-label="Search conversation"
            placeholder="Search…"
            data-ega-search
            onkeydown={(e) => {
              if (e.key === 'Escape') closeSearch();
            }}
          />
          {#if searchQuery.trim()}
            <!-- The stream's announcer reads the count; a second live region would say it twice. -->
            <span class="sp-search-count">
              {matchCount}
              {matchCount === 1 ? 'match' : 'matches'}
            </span>
          {/if}
          <button
            type="button"
            class="sp-search-clear"
            aria-label="Close search"
            data-tooltip="Close search · Esc"
            data-tooltip-placement="bottom"
            onclick={closeSearch}
          >
            <XIcon size={14} />
          </button>
        </div>
      {/if}
      {#if bookmarkFilter && !searchOpen}
        <div class="sp-search-bar">
          <span class="sp-search-count"
            >{bookmarkCount} {bookmarkCount === 1 ? 'message' : 'messages'} bookmarked</span
          >
          <!-- The empty state brings its own "Show all messages". -->
          {#if !emptyBookmarkFilter}
            <button
              type="button"
              class="sp-filter-clear"
              data-ega-bookmark-clear
              onclick={() => (bookmarkFilter = false)}>Show all</button
            >
          {/if}
        </div>
      {/if}
    {/snippet}

    <ConversationStream
      turns={filteredTurns}
      {emptyBookmarkFilter}
      {emptySearch}
      {latestTurnId}
      {focusedTurnId}
      {filterSummary}
      {varieties}
      {taskViews}
      inflight={hasInflight}
      confidencePill={settings?.confidencePill ?? true}
      confidencePillThreshold={settings?.confidencePillThreshold ??
        DEFAULT_CONFIDENCE_PILL_THRESHOLD}
      onFocusChange={(id) => (focusedTurnId = id)}
      onClearSearch={() => {
        searchQuery = '';
        searchInputEl?.focus();
      }}
      onClearBookmarkFilter={() => (bookmarkFilter = false)}
      {backendReady}
      onSetUpBackend={() => openOptionsTab('backends')}
      onShowShortcuts={() => (shortcutsOpen = true)}
      onRetry={(id) => void conversation.retry(id)}
      onRefine={(args) => onRefine(args)}
      onSelectVariant={(turnId, idx) => conversation.selectVariant(turnId, idx)}
      onSwap={(id) => void conversation.swapVariant(id)}
      onTaskSwitch={(id, t) => void conversation.taskVariant(id, t)}
      swapDisabled={turnSwapPair === null}
      swapPair={turnSwapPair}
      onRegisterKeydownHandler={(h) => {
        streamKeydownHandler = h;
      }}
      onRegenerate={(id) => void conversation.regenerateVariant(id)}
      onBookmark={(id) => conversation.toggleBookmark(id)}
      onDelete={onDeleteTurn}
      onEdit={(id) => void onEditTurn(id)}
    />

    {#if conversation.saveFailed}
      <div class="sp-save-failed" data-ega-save-failed role="status">
        <span class="sp-save-failed-text"
          >Not saved. Switching sites or closing the panel will lose these messages.</span
        >
        {#if conversation.saveFailedQuota}
          <span class="sp-save-failed-hint"
            >Storage is full — start a new conversation to free space.</span
          >
        {/if}
        <button
          type="button"
          class="sp-save-failed-retry"
          data-ega-save-failed-retry
          disabled={savingAgain}
          onclick={() => void retrySave()}
        >
          Try again
        </button>
      </div>
    {/if}

    {#if editingTurnId !== null}
      <div class="sp-editing-banner" data-ega-editing-banner role="status">
        <SquarePenIcon size={14} aria-hidden="true" />
        <span class="sp-editing-text"
          >Editing your last message. When you send, the old reply is kept as a variant.</span
        >
        <button
          type="button"
          class="sp-editing-cancel"
          aria-label="Cancel editing"
          data-ega-editing-cancel
          data-tooltip="Cancel editing · Esc"
          data-tooltip-placement="top-end"
          onclick={() => void cancelEditing()}
        >
          <XIcon size={14} />
        </button>
      </div>
    {/if}

    <InputRow
      {usesTone}
      {taskViews}
      bind:value={sourceText}
      bind:sourceLang
      bind:targetLang
      bind:task
      bind:tone
      {swapDisabled}
      {varieties}
      {pageContextLevel}
      contextEnabled={settings?.contextEnabled !== false}
      onOpenOptions={() => openOptionsTab()}
      {attachedImage}
      turns={conversation.turns}
      inflight={conversation.inflightId !== null}
      onContextLevelChange={(level) => void setPageContextLevel(level)}
      {onSwap}
      {onTargetChange}
      onAttachImage={attachComposerImage}
      onClearAttachedImage={() => {
        attachedImage = null;
        void clearComposerDraftImage();
      }}
      streaming={streamingPref}
      onToggleStreaming={(next) => {
        const previous = streamingPref;
        streamingPref = next;
        void commitSettings({ streaming: next }, () => (streamingPref = previous));
      }}
      onSend={() => void sendTurn()}
      onCancel={cancelInflight}
    />
  </AppShell>
</div>

<CommandPalette
  open={paletteOpen}
  commands={paletteCommands}
  onClose={() => (paletteOpen = false)}
/>

<ShortcutOverlay
  open={shortcutsOpen}
  surface="sidepanel"
  onClose={() => (shortcutsOpen = false)}
  shortcut={settings?.shortcut}
  pickerShortcut={settings?.pickerShortcut}
/>

<ToastHost
  position="top-center"
  offset={{ top: '84px' }}
  mobileOffset={{ top: '84px' }}
  theme={themePref}
/>

<style>
  .sp-root {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  /* AppShell renders `.ega-app-shell`; this makes the panel height-bounded so the stream scrolls. */
  .sp-root :global(.ega-app-shell) {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* Lets the stream shrink below its content and own the scrollbar. */
  .sp-root :global(.ega-app-shell-body) {
    min-height: 0;
  }
  /* Stays out of flow in both states: appearing must not push the header down. */
  .sp-skip-link {
    position: absolute;
    z-index: 20;
  }
  .sp-skip-link:focus {
    inset-inline-start: var(--space-2);
    inset-block-start: var(--space-2);
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    clip-path: none;
    white-space: nowrap;
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-size: var(--fs-xs);
    text-decoration: none;
  }
  .sp-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
  }
  .sp-header > :global(*) {
    flex-shrink: 0;
  }
  /* One row at Chrome's 400px default: the chip is the only part that gives up width. */
  .sp-header > :global(.active-backend-chip) {
    flex-shrink: 1;
    min-width: 0;
  }
  .sp-title {
    display: flex;
    align-items: center;
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1;
  }
  .sp-header-spacer {
    flex: 1 1 auto;
  }
  /* Chrome opens the panel at 400px; the model tail is the widest optional part of the row. */
  @media (max-width: 480px) {
    .sp-header :global(.chip-sep),
    .sp-header :global(.chip-model) {
      display: none;
    }
  }
  .sp-retry-popover {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 180px;
  }
  .sp-retry-popover input[type='range'] {
    width: 100%;
    cursor: pointer;
  }
  .sp-retry-readout {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
  }
  .sp-retry-value {
    font-weight: 600;
    color: var(--color-fg);
    font-variant-numeric: tabular-nums;
  }
  .sp-retry-caption {
    color: var(--color-muted);
  }
  .sp-save-failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-danger-bg-soft);
    color: var(--color-danger-fg);
    font-size: var(--fs-xs);
  }
  .sp-save-failed-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .sp-save-failed-hint {
    flex: 1 1 100%;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .sp-save-failed-retry {
    background: none;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    color: inherit;
    cursor: pointer;
    padding: 0 var(--space-2);
    flex-shrink: 0;
  }
  .sp-save-failed-retry:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .sp-editing-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent-hover);
    font-size: var(--fs-xs);
  }
  .sp-editing-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .sp-editing-cancel {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: inherit;
    box-sizing: border-box;
    padding: var(--space-1);
    min-width: 24px;
    min-height: 24px;
    flex-shrink: 0;
  }
  .sp-search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-top: 1px solid var(--color-border);
  }
  .sp-search-bar input[type='search'] {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--fs-sm);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    color: var(--color-fg);
  }
  .sp-search-bar input[type='search']:focus {
    border-color: var(--color-accent);
  }
  .sp-search-count {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sp-search-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-fg-subtle);
    box-sizing: border-box;
    padding: var(--space-1);
    min-width: 24px;
    min-height: 24px;
    flex-shrink: 0;
  }
  .sp-search-clear:hover {
    color: var(--color-fg);
  }
  .sp-filter-clear {
    margin-left: auto;
    background: none;
    border: 0;
    padding: var(--space-1);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    cursor: pointer;
  }
  .sp-filter-clear:hover {
    text-decoration: underline;
  }
</style>
