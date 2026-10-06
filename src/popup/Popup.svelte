<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getSettings, onSettingsChanged } from '@/shared/storage';
  import { patchSettings } from '@/shared/settings-bus';
  import type { Settings, Variety, LangSelection } from '@/shared/types';
  import { asLangSelection } from '@/shared/brands';
  import type { ThemePref } from '@/shared/theme';
  import AppShell from '@/shared/ui/AppShell.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import PopupHeader from './PopupHeader.svelte';
  import PopupLangPair from './PopupLangPair.svelte';
  import PopupTools from './PopupTools.svelte';
  import PopupSite from './PopupSite.svelte';
  import { listVarieties } from '@/shared/varieties';
  import { debugCatch } from '@/shared/logger';
  import { MAX_SELECTION_CHARS, settingsSaveFailedMessage } from '@/shared/constants';
  import { selectionTrimmedMessage } from '@/shared/selection-cap-copy';
  import { activeTab, openSidePanel as ctlOpenSidePanel, sendToPage } from './tab-actions';
  import {
    askPage,
    pageAccess,
    popupPageState,
    siteLabel,
    type PopupPageState,
  } from './page-state';
  import { sendMsg, sendTabMsg, type Msg, type MsgReply } from '@/shared/messages';
  import { clearPopupDraft, readPopupDraft, writePopupDraft } from '@/shared/pending-popup-draft';
  import ToastHost from '@/shared/components/ToastHost.svelte';
  import { openOptionsTab } from '@/shared/open-options-tab';
  import { toastStore } from '@/shared/components/toastStore';

  // The popup never translates inline; every trigger hands off to the side panel or the active content tab.

  let sourceLang = $state<LangSelection>('auto');
  let targetLang = $state<LangSelection>(asLangSelection('en'));
  let langTouched = $state(false);
  let varieties: Variety[] = $state([]);
  let pickerEnabled = $state(true);
  let liveSettings = $state<Settings | null>(null);
  let theme: ThemePref = $state('system');
  let backendReady = $state<boolean | null>(null);

  let freeformText = $state('');
  let freeformTextarea: HTMLTextAreaElement | null = $state(null);
  let draftHydrated = $state(false);
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let settingsUnsub: (() => void) | null = null;

  // The page behind the popup: its URL, whether its content script answered, and why the bubble stayed hidden.
  let tabUrl = $state<string | undefined>(undefined);
  let tabId = $state<number | undefined>(undefined);
  let pageReply = $state<MsgReply['ega:get-selection'] | undefined>(undefined);
  let pageRejected = $state(false);
  // Set while a switch write is in flight or after it failed, so the stored value does not fight the click.
  let siteOnOverride = $state<boolean | null>(null);

  const access = $derived(
    tabUrl === undefined || tabUrl.startsWith(chrome.runtime.getURL(''))
      ? 'unknown'
      : pageAccess(tabUrl),
  );
  const origin = $derived.by(() => {
    try {
      return new URL(tabUrl ?? '').origin;
    } catch {
      return '';
    }
  });
  const siteOn = $derived(
    siteOnOverride ??
      // The same key the content script gates on: sitePrefs[location.origin].
      liveSettings?.sitePrefs[origin]?.disabled !== true,
  );
  const pageState = $derived<PopupPageState>(
    popupPageState({ access, reply: pageReply, rejected: pageRejected, siteOff: !siteOn }),
  );
  const STATUS_ID = 'ega-popup-status';
  const pageBlockedBy = $derived(
    pageState === 'restricted' || pageState === 'site-off' || pageState === 'not-running'
      ? STATUS_ID
      : undefined,
  );
  const host = $derived(siteLabel(tabUrl));

  function cancelDraftSave(): void {
    if (draftSaveTimer !== null) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
  }

  // The page selection the box was prefilled with; saving it as a draft would carry page A's text to page B.
  let prefilledText: string | null = null;

  function scheduleDraftSave(): void {
    if (!draftHydrated) return;
    cancelDraftSave();
    const snapshotText = freeformText;
    // The page selection is never saved as a draft, and an older draft must not outlive it either.
    if (prefilledText !== null && snapshotText === prefilledText) {
      draftSaveTimer = setTimeout(() => {
        draftSaveTimer = null;
        void clearPopupDraft();
      }, 150);
      return;
    }
    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      if (snapshotText.length === 0) {
        void clearPopupDraft();
        return;
      }
      void writePopupDraft({ text: snapshotText, expanded: true });
    }, 150);
  }

  // 'auto' is valid only as a source, so swapping it into the target slot leaves the select on a value with no option.
  async function swapDirection(): Promise<void> {
    if (sourceLang === 'auto') return;
    const prevSource = sourceLang;
    const prevTarget = targetLang;
    sourceLang = prevTarget;
    targetLang = prevSource;
    // One write for the pair; the next popup opens on the swapped direction.
    const ack = await patchSettings({ defaultLang: prevTarget, defaultTargetLang: prevSource });
    if (!ack.ok) {
      // Only the fields the swap still owns roll back: a pick made while the write was in flight stands.
      if (sourceLang === prevTarget) sourceLang = prevSource;
      if (targetLang === prevSource) targetLang = prevTarget;
      toastStore.push({ message: settingsSaveFailedMessage(ack.reason), variant: 'warning' });
    }
  }

  // Chrome's wording when the tab has no content script: open before install or update.
  const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

  function tabActionFailed(fallback: string, err: unknown, failedTab: number | undefined): void {
    const detail = err instanceof Error ? err.message : String(err);
    if (failedTab === undefined || !NO_RECEIVER.test(detail)) {
      toastStore.push({ message: fallback, variant: 'danger' });
      return;
    }
    // The content script went away after the popup opened: the status line now says so, with Reload page.
    pageRejected = true;
  }

  function reloadTab(): void {
    if (tabId === undefined) return;
    void chrome.tabs
      .reload(tabId)
      .then(() => window.close())
      .catch((e: unknown) => debugCatch(e, 'popup.reloadTab'));
  }

  function noTargetToast(): void {
    toastStore.push({ message: 'Open a website tab, then try again.', variant: 'warning' });
  }

  function pageAction(msg: Msg, failed: string): void {
    void sendToPage(msg, {
      onNoTarget: noTargetToast,
      onError: (e, id) => tabActionFailed(failed, e, id),
    });
  }

  const sidePanelFeedback = {
    onNoTarget: noTargetToast,
    onError: () =>
      toastStore.push({
        message: "Ega couldn't open the side panel. Try again.",
        variant: 'danger',
      }),
  };

  function onTranslateAnyway(): void {
    const text = pageReply?.text ?? '';
    if (text === '') return;
    pageAction({ kind: 'ctx:translate-selection', text }, "Ega couldn't start the translation.");
  }

  const SITE_WRITE_TIMEOUT_MS = 2000;

  // A set, not a toggle, so a repeat lands on the same state. It flips back if the write fails or hangs.
  async function onSiteChange(on: boolean): Promise<void> {
    const before = siteOn;
    siteOnOverride = on;
    let ok = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const late = new Promise<{ ok: false }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false }), SITE_WRITE_TIMEOUT_MS);
      });
      const reply = await Promise.race([
        sendMsg({ kind: 'site:set-enabled', enabled: on, ...(tabUrl ? { url: tabUrl } : {}) }),
        late,
      ]);
      ok = reply?.ok === true;
    } catch (e) {
      debugCatch(e, 'popup.siteSwitch');
    } finally {
      clearTimeout(timer);
    }
    if (!ok) {
      siteOnOverride = before;
      toastStore.push({ message: "Ega couldn't save this change. Try again.", variant: 'warning' });
    }
  }

  // clipboardRead is optional; the request must run inside the click gesture or Chrome rejects it.
  async function ensureClipboardPermission(): Promise<boolean> {
    try {
      if (await chrome.permissions.contains({ permissions: ['clipboardRead'] })) return true;
      return await chrome.permissions.request({ permissions: ['clipboardRead'] });
    } catch (e) {
      debugCatch(e, 'popup.onClipboard.permission');
      return true;
    }
  }

  async function onClipboard(): Promise<void> {
    if (!(await ensureClipboardPermission())) {
      toastStore.push({
        message: 'Ega needs clipboard access. Click Translate clipboard again and choose Allow.',
        variant: 'warning',
      });
      return;
    }
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      debugCatch(e, 'popup.onClipboard');
      toastStore.push({
        message: "Ega couldn't read the clipboard. Allow clipboard access, then try again.",
        variant: 'warning',
      });
      return;
    }
    const full = text.trim();
    if (full.length === 0) {
      toastStore.push({
        message: 'The clipboard is empty. Copy some text first.',
        variant: 'warning',
      });
      return;
    }
    // The handoff validator rejects anything longer, so an unclamped clipboard opens an empty panel instead.
    const trimmed = full.slice(0, MAX_SELECTION_CHARS);
    const wasTrimmed = trimmed.length < full.length;
    if (wasTrimmed) {
      toastStore.push({ message: selectionTrimmedMessage('clipboard'), variant: 'warning' });
    }
    await ctlOpenSidePanel(
      {
        sourceText: trimmed,
        sourceLang,
        targetLang,
        task: 'translate',
        tone: liveSettings?.defaultTone ?? 'neutral',
      },
      {
        onNoTarget: () =>
          toastStore.push({
            message: 'The side panel needs a website tab. Open a website, then try again.',
            variant: 'warning',
          }),
        onError: sidePanelFeedback.onError,
        keepOpen: wasTrimmed,
      },
    );
  }

  async function onOpenSidePanel(): Promise<void> {
    await ctlOpenSidePanel(null, sidePanelFeedback);
  }

  async function onSendFreeform(): Promise<void> {
    const full = freeformText.trim();
    if (full.length === 0) return;
    // The handoff validator rejects anything longer, so an unclamped send opens an empty panel instead.
    const text = full.slice(0, MAX_SELECTION_CHARS);
    const wasTrimmed = text.length < full.length;
    if (wasTrimmed) {
      toastStore.push({
        message: `Your text is long. Ega sent the first ${MAX_SELECTION_CHARS} characters.`,
        variant: 'warning',
      });
    }
    cancelDraftSave();
    const sent = await ctlOpenSidePanel(
      {
        sourceText: text,
        sourceLang,
        targetLang,
        task: 'translate',
        tone: liveSettings?.defaultTone ?? 'neutral',
      },
      {
        onNoTarget: () =>
          toastStore.push({
            message: 'The side panel needs a website tab. Open a website; your text is kept.',
            variant: 'warning',
          }),
        onError: sidePanelFeedback.onError,
        keepOpen: wasTrimmed,
      },
    );
    // Dropping the draft before the open leaves a failed send with nothing to retry.
    // A trimmed send keeps the full draft, so the cut tail is not lost.
    if (sent && !wasTrimmed) await clearPopupDraft();
  }

  // Plain Enter stays a newline; the chord is what the shortcuts overlay documents.
  function onComposerKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    void onSendFreeform();
  }

  /** Asks the page, in the same tick the popup opens, for its selection and why the bubble stayed hidden. */
  async function readPage(): Promise<string> {
    let tab: chrome.tabs.Tab | null = null;
    try {
      tab = await activeTab();
    } catch (e) {
      debugCatch(e, 'popup.activeTab');
    }
    tabUrl = tab?.url;
    tabId = tab?.id;
    if (tab?.id === undefined || access !== 'ok') return '';
    const got = await askPage(tab.id, (id) => sendTabMsg(id, { kind: 'ega:get-selection' }));
    pageReply = got.reply;
    pageRejected = got.rejected;
    return got.reply?.text ?? '';
  }

  onMount(async () => {
    // Asked first: opening the popup clears the page's live selection, and the page keeps it for a minute only.
    const pageRead = readPage();
    try {
      const s = await getSettings();
      if (!langTouched) {
        sourceLang = s.defaultLang;
        targetLang = s.defaultTargetLang;
      }
      pickerEnabled = s.pickerEnabled !== false;
      liveSettings = s;
      theme = s.theme;
    } catch (e) {
      debugCatch(e, 'popup.onMount.getSettings');
    }
    // Picks up settings written by another surface, so the backend chip and the site switch stay in sync.
    settingsUnsub = onSettingsChanged((next) => {
      liveSettings = next;
      theme = next.theme;
      pickerEnabled = next.pickerEnabled !== false;
    });
    try {
      varieties = await listVarieties();
    } catch (e) {
      debugCatch(e, 'popup.onMount.listVarieties');
    }
    // The draft wins over the page selection, so a half-typed thought is not replaced by a stray selection.
    try {
      const draft = await readPopupDraft();
      if (draft !== null && freeformText === '') freeformText = draft.text;
    } catch (e) {
      debugCatch(e, 'popup.onMount.readDraft');
    }
    draftHydrated = true;
    // Anything typed before the reads finished has no input event left to save it.
    scheduleDraftSave();
    const selText = await pageRead;
    // The draft, or text typed while the page answered, wins over the page selection.
    if (selText !== '' && freeformText === '') {
      prefilledText = selText;
      freeformText = selText;
      scheduleDraftSave();
    }
    if (prefilledText !== null && freeformText === prefilledText) freeformTextarea?.focus();
    else if (document.activeElement === document.body) {
      document.querySelector<HTMLElement>('[data-ega-popup-primary]')?.focus();
    }
  });

  // Svelte 5 ignores a cleanup returned from an async onMount, because the function resolves to a Promise.
  onDestroy(() => {
    settingsUnsub?.();
  });

  // Written back here so PopupLangPair stays pure and the language pair survives a popup reopen.
  async function persistSourceLang(v: string): Promise<void> {
    const previous = sourceLang;
    const sel = asLangSelection(v);
    sourceLang = sel;
    langTouched = true;
    const ack = await patchSettings({ defaultLang: sel });
    if (!ack.ok) {
      sourceLang = previous;
      toastStore.push({ message: settingsSaveFailedMessage(ack.reason), variant: 'warning' });
    }
  }
  async function persistTargetLang(v: string): Promise<void> {
    const previous = targetLang;
    const sel = asLangSelection(v);
    targetLang = sel;
    langTouched = true;
    const ack = await patchSettings({ defaultTargetLang: sel });
    if (!ack.ok) {
      targetLang = previous;
      toastStore.push({ message: settingsSaveFailedMessage(ack.reason), variant: 'warning' });
    }
  }
</script>

<div class="popup-root">
  <AppShell>
    {#snippet header()}
      <div class="popup-header-slot">
        <PopupHeader
          settings={liveSettings}
          onOpenOptions={() => openOptionsTab()}
          onBackendReadyChange={(ready) => (backendReady = ready)}
        />
      </div>
    {/snippet}

    <div class="popup-body">
      {#if backendReady === false}
        <div class="popup-no-backend" data-ega-popup-no-backend>
          <p>Set up a backend to start.</p>
          <Button variant="primary" onclick={() => openOptionsTab('backends')}
            >Set up a backend</Button
          >
        </div>
      {/if}

      <PopupSite
        state={pageState}
        showSwitch={access === 'ok'}
        {host}
        {siteOn}
        heldBack={pageReply?.heldBack}
        statusId={STATUS_ID}
        onSiteChange={(on) => void onSiteChange(on)}
        {onTranslateAnyway}
        onReload={reloadTab}
      />

      <PopupLangPair
        {sourceLang}
        {targetLang}
        {varieties}
        onSourceChange={(v) => void persistSourceLang(v)}
        onTargetChange={(v) => void persistTargetLang(v)}
        onSwap={() => {
          langTouched = true;
          void swapDirection();
        }}
      />

      <div class="popup-actions">
        <PopupTools
          onTranslatePage={() =>
            pageAction({ kind: 'page:translateAll' }, "Ega couldn't start page translation.")}
          onChooseAreas={() =>
            pageAction({ kind: 'page:chooseAreas' }, "Ega couldn't start choosing areas.")}
          onPickElement={() =>
            pageAction({ kind: 'picker:enter' }, "Ega couldn't start the element picker.")}
          onClipboard={() => void onClipboard()}
          onOpenSidePanel={() => void onOpenSidePanel()}
          {pickerEnabled}
          {pageBlockedBy}
          quietPrimary={backendReady === false}
        />
      </div>

      <div class="popup-freeform">
        <label class="freeform-label" for="ega-popup-freeform">Translate in the side panel</label>
        <textarea
          id="ega-popup-freeform"
          bind:this={freeformTextarea}
          bind:value={freeformText}
          class="freeform-textarea"
          dir="auto"
          data-ega-freeform-textarea
          placeholder="Paste or type text"
          oninput={scheduleDraftSave}
          onkeydown={onComposerKey}
          rows="3"></textarea>
        <div class="freeform-actions" data-ega-action-bar>
          <Button
            variant="secondary"
            dataAttrs={{
              'aria-disabled': freeformText.trim().length === 0 ? 'true' : undefined,
              'data-ega-freeform-send': '',
            }}
            onclick={() => void onSendFreeform()}>Translate</Button
          >
        </div>
      </div>
    </div>
  </AppShell>
</div>

<ToastHost position="bottom-center" {theme} />

<style>
  .popup-root {
    display: contents;
  }
  .popup-header-slot {
    display: flex;
    align-items: center;
    width: 100%;
  }
  .popup-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .popup-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .popup-no-backend {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    font-size: var(--fs-base);
  }
  .popup-no-backend p {
    margin: 0;
  }
  .popup-freeform {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .freeform-label {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .freeform-textarea {
    width: 100%;
    min-height: 4.5rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    resize: vertical;
  }
  .freeform-textarea:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .freeform-actions {
    display: flex;
    justify-content: flex-end;
  }
  .freeform-actions :global(.ega-btn[aria-disabled='true']) {
    color: var(--color-fg-disabled);
    border-color: var(--color-control-border);
    cursor: var(--cursor-disabled);
  }
</style>
