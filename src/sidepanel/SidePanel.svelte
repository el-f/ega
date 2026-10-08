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
  import PanelHeader from './PanelHeader.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import { flushPendingDeletes, forgetPendingDeletes } from '@/shared/saved-conversations';
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
  import type { ComposerMode, SuggestionKind, SuggestionResult } from './state/thread-view';
  import { conversationLabel } from '@/shared/saved-conversations';
  import { INDEX_KEY } from './state/conversation-store';
  import {
    visibleTurns,
    searchTurns,
    turnTaskValue,
    type UserTurnData,
  } from './state/conversation';
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
  // Ids, not flags: a tab switch swaps the thread, so "drop the last exchange" would hit another site's turns.
  let composerMode = $state<ComposerMode>({ kind: 'send' });
  const editingTurnId = $derived(composerMode.kind === 'edit' ? composerMode.turnId : null);

  // Reported by the backend chip, which already resolves the chain and probes the key-less backends.
  let backendReady = $state<boolean | null>(null);
  /** The first storage read landed: before it the thread area stays blank, so no empty state flashes. */
  let threadLoaded = $state(false);
  /** Said once when the panel starts showing another conversation. */
  let switchAnnouncement = $state<string | null>(null);
  let shownId: string | null = null;
  $effect(() => {
    const id = conversation.activeId;
    if (!threadLoaded) return;
    if (shownId !== null && shownId !== id) {
      switchAnnouncement = `Showing the conversation for ${conversationLabel(id)}`;
    }
    shownId = id;
  });
  /** Toasts sit just above the composer, which grows with the message. */
  let composerEl = $state<HTMLElement | null>(null);
  let composerHeight = $state(0);
  /** The save-failed banner sits right above the composer, so a toast must clear it too. */
  let bannerEl = $state<HTMLElement | null>(null);
  let bannerHeight = $state(0);
  const toastBottom = $derived(
    `${composerHeight + (conversation.saveFailed ? bannerHeight : 0) + 8}px`,
  );
  // Not bind:clientHeight: that pulls Svelte's size-binding runtime into the vendor chunk every web page loads.
  function trackHeight(el: HTMLElement | null, set: (h: number) => void): (() => void) | undefined {
    if (!el) return;
    const ro = new ResizeObserver(() => set(el.clientHeight));
    ro.observe(el, { box: 'border-box' });
    return () => ro.disconnect();
  }
  $effect(() => trackHeight(composerEl, (h) => (composerHeight = h)));
  $effect(() => trackHeight(bannerEl, (h) => (bannerHeight = h)));
  let bookmarkFilter = $state(false);
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let searchInputEl: HTMLInputElement | null = $state(null);

  // A new exchange is never bookmarked and never matches the old query, so either filter would hide the answer.
  // Escape, the X and the header magnifier are one action; focus returns to the toggle.
  function closeSearch(): void {
    searchQuery = '';
    searchOpen = false;
    // An empty thread renders no toggle (search opened from the palette): the message box takes focus.
    const toggle = document.querySelector<HTMLElement>('[data-ega-search-toggle]');
    if (toggle) toggle.focus();
    else focusComposer();
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
  function taskTakesImage(id: TaskId): boolean {
    return taskViews?.find((v) => v.id === id)?.image ?? (id === 'translate' || id === 'explain');
  }
  const takesImage = $derived(taskTakesImage(task));
  // An attached image takes the OCR arm unless the task reads images itself; that prompt has no tone and no page info.
  // An edit sends words only, so an image waiting in the composer goes with the next new message.
  const sendImage = $derived(composerMode.kind === 'send' ? attachedImage : null);
  const toOcr = $derived(sendImage !== null && (task === 'translate' || !takesImage));
  const usesTone = $derived(
    !toOcr &&
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

  const latestTurnId = $derived(conversation.turns.at(-1)?.id ?? null);
  const hasInflight = $derived(conversation.inflightId !== null);
  /** The newest reply's detected language lets the composer swap from Auto-detect. */
  const newestDetectedLang = $derived.by(() => {
    for (let i = conversation.turns.length - 1; i >= 0; i--) {
      const t = conversation.turns[i];
      if (t?.role === 'assistant' && t.detectedLang !== undefined) return t.detectedLang;
    }
    return undefined;
  });
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
    return pageInfoGoesFor(taskId) ? await collectActiveTabContext() : null;
  }

  /** The tab shows another site while the user reads this conversation, so its page says nothing about it. */
  function pageInfoGoesFor(taskId: TaskId): boolean {
    const taskSendsIt = taskViews?.find((v) => v.id === taskId)?.pageContext ?? true;
    return (
      settings?.contextEnabled === true &&
      taskSendsIt &&
      conversation.activeSite === conversation.tabSite
    );
  }
  // An edit resends with its own message's task, so row A names what that task sends.
  const editedTurn = $derived(
    conversation.turns.find((t): t is UserTurnData => t.role === 'user' && t.id === editingTurnId),
  );
  const pageInfoGoes = $derived(
    !toOcr && pageInfoGoesFor(editedTurn ? turnTaskValue(editedTurn) : task),
  );

  // inflightId only flips after the context-collection await, so a fast double send would dispatch twice.
  let sending = false;

  const NEW_CONVERSATION_TOAST = 'new-conversation';
  /** X14: a send is a new action, so the toasts that wait for the user close, and so does the New conversation Undo. */
  function sendStarted(): void {
    toastStore.closeSticky();
    toastStore.close(NEW_CONVERSATION_TOAST);
  }

  async function sendTurn(): Promise<void> {
    const text = sourceText.trim();
    if (composerMode.kind === 'refine') {
      if (!text || conversation.inflightId !== null) return;
      sendStarted();
      const turnId = composerMode.turnId;
      if (await onRefine({ turnId, refinementBody: text })) leaveRefine();
      return;
    }
    const img = sendImage;
    if (!text && !img) return;
    if (sending || conversation.inflightId !== null) return;
    sendStarted();
    sending = true;
    clearFilters();
    try {
      // Read the page before touching the thread, and bail if the thread or the mode moved meanwhile: the setup below is for this one.
      const originBefore = conversation.activeId;
      const modeBefore = composerMode;
      // An edit goes out with the setup its message was sent with: the chip, hidden while editing, is for new messages.
      const edited = conversation.turns.find(
        (t): t is UserTurnData => t.role === 'user' && t.id === editingTurnId,
      );
      const sendTask = edited ? turnTaskValue(edited) : task;
      // An image goes to the OCR arm for Translate and for any task that takes no images; that arm sends no page context.
      const ocr = img !== null && (sendTask === 'translate' || !taskTakesImage(sendTask));
      const context = ocr ? undefined : await currentPageContext(sendTask);
      if (conversation.activeId !== originBefore || composerMode !== modeBefore) return;
      // The previous turn is in the composer, so drop it or the re-send appends a duplicate.
      let preservedResponse: string | undefined;
      if (editingTurnId !== null) {
        if (conversation.lastUserTurn()?.id === editingTurnId) {
          const prior = conversation.turns.find(
            (t) => t.role === 'assistant' && t.attachedToTurnId === editingTurnId,
          );
          if (prior?.status === 'done' && prior.content) preservedResponse = prior.content;
          conversation.dropLastUserExchange();
        } else {
          // Edit from here: the message and everything after it go now, when the edit is sent.
          conversation.editFrom(editingTurnId);
        }
        composerMode = { kind: 'send' };
        draftBeforeEdit = '';
      }
      const content = text || IMAGE_TURN_PLACEHOLDER;
      // 'explain' keeps its own kind so the router takes the vision-explain arm instead of plain OCR.
      // A custom task runs under kind translate and keeps its id; an image always takes the image arm.
      const builtIn = builtInTask(sendTask);
      const kind = ocr ? 'image-translate' : (builtIn ?? 'translate');
      const sendTone = edited ? edited.tone : usesTone ? tone : undefined;
      await conversation.send({
        content,
        kind,
        ...(builtIn === null && !ocr ? { taskId: sendTask } : {}),
        ...(preservedResponse !== undefined ? { preservedResponse } : {}),
        ...(img ? { imageDataUrl: img } : {}),
        sourceLang: edited?.dispatch?.sourceLang ?? asLangSelection(sourceLang),
        targetLang: edited?.dispatch?.targetLang ?? asLangSelection(targetLang),
        stream: streamingPref,
        ...(sendTone !== undefined ? { tone: sendTone } : {}),
        ...(context !== undefined ? { context } : {}),
      });
      sourceText = '';
      if (img !== null) {
        attachedImage = null;
        void clearComposerDraftImage();
      }
    } finally {
      sending = false;
    }
  }

  async function activeTabId(): Promise<number | undefined> {
    try {
      const tabs = await chrome.tabs.query(
        panelWindowId !== undefined
          ? { active: true, windowId: panelWindowId }
          : { active: true, lastFocusedWindow: true },
      );
      return tabs[0]?.id;
    } catch (e) {
      debugCatch(e, 'sidepanel.activeTabId');
      return undefined;
    }
  }

  /** The empty panel's suggestions: send the page's selection, or start whole-page translate in the tab. */
  async function onSuggestion(kind: SuggestionKind): Promise<SuggestionResult> {
    const tabId = await activeTabId();
    if (tabId === undefined) return 'unreadable';
    if (kind === 'translate-page') {
      try {
        await sendTabMsg(tabId, { kind: 'page:translateAll' });
        return 'page';
      } catch (e) {
        debugCatch(e, 'sidepanel.onSuggestion.page');
        return 'unreadable';
      }
    }
    const text = await sendTabMsg(tabId, { kind: 'ega:get-selection' }).then(
      (r) => r?.text.trim() ?? '',
      (e: unknown) => {
        debugCatch(e, 'sidepanel.onSuggestion.selection');
        return null;
      },
    );
    if (text === null) return 'unreadable';
    if (text === '') return 'no-selection';
    if (conversation.inflightId !== null) return 'sent';
    sendStarted();
    const picked = kind === 'explain-selection' ? 'explain' : 'translate';
    const context = await currentPageContext(picked);
    await conversation.send({
      content: text,
      kind: picked,
      sourceLang: asLangSelection(sourceLang),
      targetLang: asLangSelection(targetLang),
      stream: streamingPref,
      ...(context !== undefined ? { context } : {}),
    });
    await tick();
    focusComposer();
    return 'sent';
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

  /** Composer text an edit or a described change replaced, so leaving the mode puts it back. */
  let draftBeforeEdit = '';

  /** "Describe a change…": the composer takes the change for that one reply; the draft waits. */
  async function onDescribeChange(turnId: string): Promise<void> {
    // Leaving an edit asks first when the edited text changed; staying in it ends here.
    if (composerMode.kind === 'edit' && !(await cancelEditing())) return;
    if (composerMode.kind === 'send') {
      flushDraftSave();
      draftBeforeEdit = sourceText;
    }
    composerMode = { kind: 'refine', turnId };
    sourceText = '';
    await tick();
    focusComposer();
  }

  function leaveRefine(): void {
    if (composerMode.kind !== 'refine') return;
    composerMode = { kind: 'send' };
    sourceText = draftBeforeEdit;
    draftBeforeEdit = '';
  }

  function cancelMode(): void {
    if (composerMode.kind === 'refine') leaveRefine();
    else if (composerMode.kind === 'edit') void cancelEditing();
    focusComposer();
  }

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
    if (refusedForMode()) return;
    const last = conversation.lastUserTurn();
    if (!last) return;
    // The pencil is hidden for image turns, but 'e' does not go through it.
    // Keyed on the image, not the kind: an Explain send carries one too.
    if (last.hasImage) {
      toastStore.push({
        message: "An image message can't be edited. Send the image again to change it.",
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
    enterEdit(last.id, last.content);
  }

  /** The composer takes the message text; the draft waits, and leaving the mode puts it back. */
  function enterEdit(turnId: string, text: string): void {
    flushDraftSave();
    draftBeforeEdit = sourceText;
    sourceText = text;
    composerMode = { kind: 'edit', turnId, lastId: conversation.lastUserTurn()?.id ?? turnId };
    void tick().then(focusComposer);
  }

  /** An edit or a described change holds the composer until it is sent or cancelled. */
  function refusedForMode(): boolean {
    if (composerMode.kind === 'send') return false;
    toastStore.push({
      message:
        composerMode.kind === 'refine'
          ? 'Send or cancel the change first.'
          : 'Send or cancel your edit first.',
      variant: 'warning',
    });
    return true;
  }

  // An older message needs a confirm: sending its edit removes what follows. The newest reuses pullLastUserTurnIntoInput.
  async function onEditTurn(turnId: string): Promise<void> {
    if (conversation.inflightId !== null) return;
    const userTurns = conversation.turns.filter((t) => t.role === 'user');
    const lastUserTurn = userTurns[userTurns.length - 1];
    if (turnId === lastUserTurn?.id) {
      pullLastUserTurnIntoInput();
      return;
    }
    if (refusedForMode()) return;
    const turnIdx = conversation.turns.findIndex((t) => t.id === turnId);
    if (turnIdx === -1) return;
    // The old message's text replaces the composer, so a draft the user typed must not be lost to it.
    const content = conversation.turns[turnIdx]?.content ?? '';
    if (sourceText.trim() && sourceText !== content) {
      toastStore.push({
        message: 'Clear the message box first to edit this message.',
        variant: 'warning',
      });
      return;
    }
    const later = conversation.turns.length - turnIdx - 1;
    const ok = await confirmDialog({
      title: 'Edit from here?',
      body: `Sending your edit removes the ${later} ${later === 1 ? 'message' : 'messages'} after it.`,
      confirmLabel: 'Remove and edit',
      cancelLabel: 'Keep messages',
      danger: true,
    });
    if (!ok) return;
    // The confirm stays open while the thread can move: a reply, another mode or a delete since then wins.
    if (
      conversation.inflightId !== null ||
      composerMode.kind !== 'send' ||
      !conversation.turns.some((t) => t.id === turnId)
    ) {
      return;
    }
    enterEdit(turnId, content);
  }

  /** Settles when the first follow of the tab is over, failed or not: a seed or handoff heard before it waits for it. */
  let firstFollowDone: () => void = () => {};
  const firstFollow = new Promise<void>((resolve) => (firstFollowDone = resolve));

  const intake = createIntake({
    firstFollow,
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
    followSite,
    attachImage: (src) => {
      // An image would turn the edited text into an image send, or wait unseen behind a described change.
      const refusedInMode = (): boolean => {
        if (composerMode.kind === 'send') return false;
        toastStore.push({
          message:
            composerMode.kind === 'refine'
              ? "The page image wasn't attached because you're changing a reply."
              : "The page image wasn't attached because you're editing a message.",
          variant: 'warning',
        });
        return true;
      };
      const attach = (): void => {
        // The Replace offer lasts, so the mode is checked again when it is used.
        if (refusedInMode()) return;
        attachComposerImage(src);
        void tick().then(focusComposer);
      };
      if (refusedInMode()) return;
      // The user's own image wins until they say otherwise.
      if (attachedImage !== null && attachedImage !== src) {
        toastStore.push({
          message: 'Replace the attached image with the one from the page?',
          variant: 'info',
          action: { label: 'Replace', onClick: attach },
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
              'conversation.search': () => void toggleSearch(),
            }),
        'conversation.bookmarks': () => (bookmarkFilter = !bookmarkFilter),
        ...(hasInflight ? { 'conversation.cancel-all': cancelAllInflight } : {}),
      },
      currentTheme: themePref,
    });
  }

  /** Escape asks before it discards an edit the user changed. False: the user kept editing. */
  async function cancelEditing(): Promise<boolean> {
    const original = conversation.turns.find((t) => t.id === editingTurnId)?.content ?? '';
    if (sourceText.trim() && sourceText !== original) {
      const ok = await confirmDialog({
        title: 'Discard your edit?',
        body: "What you typed here isn't saved anywhere else.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!ok) return false;
    }
    composerMode = { kind: 'send' };
    sourceText = draftBeforeEdit;
    draftBeforeEdit = '';
    return true;
  }

  /** The edit target left the thread. Keep what the user typed — it just sends as a new message now. */
  function detachEdit(): void {
    if (editingTurnId === null) return;
    composerMode = { kind: 'send' };
    draftBeforeEdit = '';
    toastStore.push({
      message: 'The conversation changed, so your edit will send as a new message.',
      variant: 'warning',
    });
  }

  // A handoff, a seed or another window's turn can land after it, or the message can go; either way the edit is a new message now.
  $effect(() => {
    const mode = composerMode;
    const last = conversation.lastUserTurn()?.id;
    if (mode.kind !== 'edit') return;
    if (last !== mode.lastId || !conversation.turns.some((t) => t.id === mode.turnId)) {
      detachEdit();
    }
  });

  // The reply a described change targets left the thread (another conversation opened, or it was deleted).
  $effect(() => {
    const mode = composerMode;
    if (mode.kind === 'refine' && !conversation.turns.some((t) => t.id === mode.turnId)) {
      leaveRefine();
    }
  });

  // A turn that is gone — deleted, or left behind by an origin switch — cannot keep the ring: `r` would act on it.
  $effect(() => {
    const id = focusedTurnId;
    if (id !== null && !conversation.turns.some((t) => t.id === id)) focusedTurnId = null;
  });

  /** Focuses a message's article and makes it the j/k/r one; false when it is not on screen. */
  function focusTurn(id: string | undefined): boolean {
    if (id === undefined) return false;
    const el = document.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(id)}"]`);
    if (el === null) return false;
    focusedTurnId = id;
    el.focus();
    return true;
  }

  /**
   * Un-bookmarking under the bookmark filter removes the pair, and the menu that did it, from the list.
   * Focus goes to the next message still shown, else the previous one, else the empty state's "Show all messages".
   */
  function onToggleBookmark(id: string): void {
    const shown = filteredTurns.map((t) => t.id);
    const at = shown.indexOf(id);
    conversation.toggleBookmark(id);
    if (!bookmarkFilter) return;
    void tick().then(() =>
      setTimeout(() => {
        if (filteredTurns.some((t) => t.id === id)) return;
        const users = filteredTurns.filter((t) => t.role === 'user');
        const next = users.find((t) => shown.indexOf(t.id) > at);
        const prev = [...users].reverse().find((t) => shown.indexOf(t.id) < at);
        if (focusTurn(next?.id) || focusTurn(prev?.id)) return;
        document.querySelector<HTMLElement>('[data-ega-no-bookmarks] button')?.focus();
      }, 0),
    );
  }

  /**
   * The menu that started a delete closes onto a trigger that is gone, so focus would fall to the page body.
   * It goes to the next message, else the previous one, else the message box (spec §8.5), once the menu is done.
   */
  function focusAfterDelete(at: number): void {
    void tick().then(() =>
      setTimeout(() => {
        const turns = conversation.turns;
        const next = turns.slice(at).find((t) => t.role === 'user');
        const prev = turns
          .slice(0, at)
          .reverse()
          .find((t) => t.role === 'user');
        if (!focusTurn(next?.id) && !focusTurn(prev?.id)) focusComposer();
      }, 0),
    );
  }

  /** Deleting a turn is the only destructive action in the panel with no confirm, so it gets Undo. */
  function onDeleteTurn(turnId: string): void {
    const ids = conversation.turns.map((t) => t.id);
    const slice = conversation.deleteTurn(turnId);
    if (!slice || slice.removed.length === 0) return;
    focusAfterDelete(ids.indexOf(slice.removed[0]?.id ?? ''));
    toastStore.push({
      message: slice.removed.length > 1 ? 'Message and reply deleted' : 'Message deleted',
      variant: 'info',
      action: {
        label: 'Undo',
        onClick: () => {
          if (!conversation.restoreTurns(slice)) {
            toastStore.push({
              message: "Can't undo. This conversation is no longer open.",
              variant: 'warning',
            });
            return;
          }
          const restored = slice.removed.find((t) => t.role === 'user') ?? slice.removed[0];
          void tick().then(() => focusTurn(restored?.id));
        },
      },
    });
  }

  /** Every bare-key shortcut is off while the user is typing. */
  function isTextEntry(target: EventTarget | null): boolean {
    return (
      // A native select or a bits-ui menu owns its own arrow keys and letter type-ahead.
      // The reply's action buttons do not: from them j/k/c/e/? stay the panel's navigation.
      target instanceof HTMLSelectElement ||
      (target instanceof Element && target.closest('[role="menu"]') !== null) ||
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
      composerMode.kind !== 'send' &&
      conversation.inflightId === null &&
      !dialogOpen()
    ) {
      cancelMode();
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
    // An edit or a described change holds other text; the stored draft is what leaving the mode restores.
    if (composerMode.kind !== 'send') return;
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
      await followSite(await getActiveOrigin());
    } catch (e) {
      debugCatch(e, 'sidepanel.onMount.followSite');
    }
    threadLoaded = true;
    firstFollowDone();
    // Registered before the drains below: every await here is a window where a tab switch or a
    // foreign write goes unheard, and the drains are the longest stretch of them.
    if (destroyed) return;
    chrome.storage.onChanged.addListener(onStorageChanged);
    originFollowerUnsub = startOriginFollower((origin) => void followSite(origin));
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
    flushPendingDeletes();
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
      forgetPendingDeletes();
      conversation.resetAfterPurge();
      focusedTurnId = null;
      composerMode = { kind: 'send' };
    }
  }

  /** The one list of settings this panel mirrors. A field missing here is a
   *  field a second window can silently overwrite. */
  function applySettings(s: Settings): void {
    settings = s;
    themePref = s.theme;
    streamingPref = s.streaming !== false;
    pageContextLevel = s.pageContextLevel;
  }

  onDestroy(() => {
    destroyed = true;
    settingsUnsub?.();
    chrome.runtime.onMessage.removeListener(intake.onRuntimeMessage);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    window.removeEventListener('pagehide', persistNow);
    originFollowerUnsub?.();
    // Cancel first so the write records the canceled turn and clears the debounce it schedules.
    conversation.cancel();
    persistNow();
  });

  /** X14: a tab on another site shows that site's conversation, so the toasts about this one close. */
  function followSite(origin: string): Promise<boolean> {
    if (origin !== conversation.activeSite) toastStore.closeSticky();
    return conversation.followSite(origin);
  }

  /** Shows a conversation from the list; focus goes to the message box. */
  async function openConversation(id: string): Promise<boolean> {
    // Before the switch: a warning the switch itself raises (messages not kept) must stay.
    toastStore.closeSticky();
    if (!(await conversation.openConversation(id))) return false;
    // A query or the bookmark filter was for the conversation the panel left.
    clearFilters();
    focusedTurnId = null;
    await tick();
    focusComposer();
    return true;
  }

  /** One click, nothing lost: the old conversation stays in the list, and Undo opens it again. */
  async function onNewConversation(): Promise<void> {
    if (conversation.turns.length === 0) return;
    const previous = await conversation.startNewConversation();
    clearFilters();
    focusedTurnId = null;
    leaveRefine();
    composerMode = { kind: 'send' };
    draftBeforeEdit = '';
    await tick();
    focusComposer();
    toastStore.push({
      message: 'Started a new conversation',
      variant: 'info',
      key: NEW_CONVERSATION_TOAST,
      action: {
        label: 'Undo',
        onClick: () => {
          void conversation.openConversation(previous).then(focusComposer);
        },
      },
    });
  }

  let savingAgain = $state(false);

  /** The banner is the only way back once storage has room again; a toast reports how Try again went. */
  async function retrySave(): Promise<void> {
    if (savingAgain) return;
    savingAgain = true;
    try {
      await conversation.flush();
      toastStore.push({ message: 'Conversation saved.', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'sidepanel.retrySave');
      // The banner stays up either way; without this the second failure looks like a dead button.
      toastStore.push({
        message: conversation.saveFailedQuota
          ? 'Still out of space. Delete old conversations to make room.'
          : "Still couldn't save. Try again in a moment.",
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
      toastStore.push({ message: "Couldn't copy. Try again.", variant: 'danger' });
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
    const site = conversation.activeSite
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
      <PanelHeader
        {settings}
        activeId={conversation.activeId}
        tabSite={conversation.tabSite}
        {isEmptyThread}
        {searchOpen}
        bind:bookmarkFilter
        onNewConversation={() => void onNewConversation()}
        onToggleSearch={() => void toggleSearch()}
        onOpenConversation={openConversation}
        onDeleteConversation={(id, onFail) => conversation.deleteConversation(id, onFail)}
        onCopyMarkdown={() => void copyMarkdown()}
        onDownloadJson={downloadJson}
        onShowShortcuts={() => (shortcutsOpen = true)}
        onOpenSettings={() => openOptionsTab()}
        onSetUpBackend={() => openOptionsTab('backends')}
        onReadyChange={(ready) => (backendReady = ready)}
        onCancelAll={hasInflight ? cancelAllInflight : undefined}
      />
      {#if searchOpen}
        <div class="sp-search-bar" role="search">
          <input
            bind:this={searchInputEl}
            bind:value={searchQuery}
            type="search"
            dir="auto"
            aria-label="Search this conversation"
            placeholder="Search this conversation"
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
          <IconButton
            icon={XIcon}
            ariaLabel="Close search"
            tooltip="Close search (Esc)"
            tooltipPlacement="bottom"
            size="sm"
            onclick={closeSearch}
          />
        </div>
      {/if}
      {#if bookmarkFilter && !searchOpen}
        <div class="sp-search-bar">
          <span class="sp-search-count">{bookmarkCount} bookmarked</span>
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
      loaded={threadLoaded}
      {emptyBookmarkFilter}
      {emptySearch}
      {latestTurnId}
      {focusedTurnId}
      {filterSummary}
      {switchAnnouncement}
      {varieties}
      {taskViews}
      inflight={hasInflight}
      confidence={{
        show: settings?.confidencePill ?? true,
        threshold: settings?.confidencePillThreshold ?? DEFAULT_CONFIDENCE_PILL_THRESHOLD,
      }}
      composerTarget={targetLang}
      changingTurnId={composerMode.kind === 'refine' ? composerMode.turnId : null}
      {editingTurnId}
      onFocusChange={(id) => (focusedTurnId = id)}
      onClearSearch={() => {
        searchQuery = '';
        searchInputEl?.focus();
      }}
      onClearBookmarkFilter={() => (bookmarkFilter = false)}
      {backendReady}
      onSetUpBackend={() => openOptionsTab('backends')}
      {onSuggestion}
      recordsDetails={settings?.captureResultMeta !== false}
      onRetry={(id) => {
        toastStore.closeSticky();
        void conversation.retry(id);
      }}
      onRefine={(args) => onRefine(args)}
      onSelectVariant={(turnId, idx) => conversation.selectVariant(turnId, idx)}
      onSwap={(id) => void conversation.swapVariant(id)}
      onTaskSwitch={(id, t) => void conversation.taskVariant(id, t)}
      swapPairFor={(id) => conversation.swapPair(id)}
      onTranslateInto={(id, lang) => void conversation.langVariant(id, lang)}
      onDescribeChange={(id) => void onDescribeChange(id)}
      onRegisterKeydownHandler={(h) => {
        streamKeydownHandler = h;
      }}
      onRegenerate={(id) => {
        toastStore.closeSticky();
        void conversation.regenerateVariant(id);
      }}
      onBookmark={onToggleBookmark}
      onDelete={onDeleteTurn}
      onEdit={(id) => void onEditTurn(id)}
    />

    {#if conversation.saveFailed}
      <div class="sp-save-failed" data-ega-save-failed role="status" bind:this={bannerEl}>
        <span class="sp-save-failed-text"
          >{conversation.saveFailedQuota
            ? 'Storage is full. Delete old conversations to make room.'
            : "These messages aren't saved yet."}</span
        >
        <!-- aria-disabled, not disabled: a disabled button drops the focus it holds to the page body. -->
        <button
          type="button"
          class="sp-save-failed-retry"
          data-ega-save-failed-retry
          aria-disabled={savingAgain ? 'true' : undefined}
          onclick={() => void retrySave()}
        >
          Try again
        </button>
      </div>
    {/if}

    <div class="sp-composer" bind:this={composerEl}>
      <InputRow
        {usesTone}
        {taskViews}
        bind:value={sourceText}
        bind:sourceLang
        bind:targetLang
        bind:task
        bind:tone
        {varieties}
        {pageContextLevel}
        contextEnabled={settings?.contextEnabled !== false}
        {pageInfoGoes}
        detectedLang={newestDetectedLang}
        onOpenSettings={() => openOptionsTab()}
        {attachedImage}
        turns={conversation.turns}
        inflight={conversation.inflightId !== null}
        mode={composerMode}
        onCancelMode={cancelMode}
        onContextLevelChange={(level) => void setPageContextLevel(level)}
        onAttachImage={attachComposerImage}
        onClearAttachedImage={() => {
          attachedImage = null;
          void clearComposerDraftImage();
        }}
        onSend={() => void sendTurn()}
        onCancel={cancelInflight}
      />
    </div>
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
  position="bottom-center"
  offset={{ bottom: toastBottom }}
  mobileOffset={{ bottom: toastBottom }}
  theme={themePref}
/>

<style>
  /* A trigger whose menu or popover is open has said what it does; its hover label would sit on the open layer. */
  :global([data-tooltip][aria-expanded='true']:not([data-tooltip='']):hover::after),
  :global([data-tooltip][aria-expanded='true']:not([data-tooltip='']):focus-visible::after) {
    content: none;
  }
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
    padding: 0;
    gap: 0;
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
  .sp-composer {
    flex: 0 0 auto;
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
  .sp-save-failed-retry {
    min-block-size: 28px;
    background: none;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    color: inherit;
    font: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
    padding: 0 var(--space-2);
    flex-shrink: 0;
  }
  .sp-save-failed-retry[aria-disabled='true'] {
    color: var(--color-fg-disabled);
    cursor: default;
  }
  /* Spec §4.6: full width under the header row, 36 tall, one top rule. It sits inside the header's padding,
     so it steps out of the sides and the bottom, and its rule takes the header's own colour. */
  .sp-search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    box-sizing: border-box;
    min-block-size: 36px;
    margin-inline: calc(-1 * var(--card-pad));
    margin-block: var(--space-2) calc(-1 * var(--space-2));
    padding: var(--space-1) var(--card-pad);
    border-top: 1px solid var(--color-border-subtle);
  }
  .sp-search-bar input[type='search'] {
    flex: 1 1 auto;
    min-width: 0;
    box-sizing: border-box;
    min-block-size: 28px;
    font-size: var(--fs-md);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    color: var(--color-fg);
  }
  .sp-search-bar input[type='search']::-webkit-search-cancel-button {
    display: none;
  }
  .sp-search-count {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sp-filter-clear {
    margin-inline-start: auto;
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
