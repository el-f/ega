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
  import { listVarieties } from '@/shared/varieties';
  import { debugCatch } from '@/shared/logger';
  import { MAX_SELECTION_CHARS, settingsSaveFailedMessage } from '@/shared/constants';
  import { selectionTrimmedMessage } from '@/shared/selection-cap-copy';
  import {
    openPicker as ctlOpenPicker,
    openSidePanel as ctlOpenSidePanel,
    translatePage as ctlTranslatePage,
  } from './tab-actions';
  import { prefillFromActiveTabSelection } from './autofill';
  import { clearPopupDraft, readPopupDraft, writePopupDraft } from '@/shared/pending-popup-draft';
  import { Toaster } from 'svelte-sonner';
  import { openOptionsTab } from '@/shared/open-options-tab';
  import { toastStore } from '@/shared/components/toastStore';

  // The popup never translates inline; every trigger hands off to the side panel or the active content tab.

  let sourceLang = $state<LangSelection>('auto');
  let targetLang = $state<LangSelection>(asLangSelection('en'));
  let langTouched = $state(false);
  let varieties: Variety[] = $state([]);
  let pickerEnabled = $state(true);
  let liveSettings: Settings | null = $state(null);
  let theme: ThemePref = $state('system');
  let backendReady = $state<boolean | null>(null);

  let freeformText = $state('');
  let freeformExpanded = $state(false);
  let freeformTextarea: HTMLTextAreaElement | null = $state(null);
  let draftHydrated = $state(false);
  let pendingFocus = $state(false);
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let settingsUnsub: (() => void) | null = null;

  function expandFreeform(): void {
    freeformExpanded = true;
    pendingFocus = true;
    scheduleDraftSave();
  }

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
    const snapshotExpanded = freeformExpanded;
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
      if (snapshotText.length === 0 && !snapshotExpanded) {
        void clearPopupDraft();
        return;
      }
      void writePopupDraft({ text: snapshotText, expanded: snapshotExpanded });
    }, 150);
  }

  $effect(() => {
    // The textarea binds only after the {:else} branch renders, which is later than a queueMicrotask from onMount.
    if (pendingFocus && freeformTextarea !== null) {
      freeformTextarea.focus();
      pendingFocus = false;
    }
  });

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

  // Chrome's wording when the tab has no content script: open before install or update, or a page that blocks extensions.
  const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

  function tabActionFailed(fallback: string, err: unknown, tabId: number | undefined): void {
    const detail = err instanceof Error ? err.message : String(err);
    if (tabId === undefined || !NO_RECEIVER.test(detail)) {
      toastStore.push({ message: fallback, variant: 'danger' });
      return;
    }
    toastStore.push({
      message:
        'Ega is not running on this page. Reload the page and try again. Some pages, like the Chrome Web Store, never allow extensions.',
      variant: 'warning',
      action: {
        label: 'Reload page',
        onClick: () => {
          void chrome.tabs.reload(tabId).catch((e: unknown) => debugCatch(e, 'popup.reloadTab'));
        },
      },
    });
  }

  async function onTranslatePage(): Promise<void> {
    await ctlTranslatePage({
      onNoTarget: () =>
        toastStore.push({
          message: 'No translatable page here — open a regular website tab first.',
          variant: 'warning',
        }),
      onError: (e, tabId) => tabActionFailed('Could not start page translation.', e, tabId),
    });
  }

  function noTargetToast(): void {
    toastStore.push({
      message: 'No page to work on here — open a regular website tab first.',
      variant: 'warning',
    });
  }

  const sidePanelFeedback = {
    onNoTarget: noTargetToast,
    onError: () =>
      toastStore.push({ message: 'Could not open the side panel.', variant: 'danger' }),
  };

  async function onPickElement(): Promise<void> {
    await ctlOpenPicker({
      onNoTarget: noTargetToast,
      onError: (e, tabId) => tabActionFailed('Could not start the picker.', e, tabId),
    });
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
        message: 'Clipboard access was denied — click the tile again and choose Allow.',
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
        message: 'Ega cannot read your clipboard — allow clipboard access and try again.',
        variant: 'warning',
      });
      return;
    }
    const full = text.trim();
    if (full.length === 0) {
      toastStore.push({
        message: 'Clipboard is empty — copy some text first.',
        variant: 'warning',
      });
      return;
    }
    // The handoff validator rejects anything longer, so an unclamped clipboard opens an empty panel instead.
    const trimmed = full.slice(0, MAX_SELECTION_CHARS);
    const wasTrimmed = trimmed.length < full.length;
    if (wasTrimmed) {
      toastStore.push({
        message: selectionTrimmedMessage('clipboard'),
        variant: 'warning',
      });
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
        // The user has text ready, so the blocker to explain is the missing tab, not the page.
        onNoTarget: () =>
          toastStore.push({
            message:
              'The side panel needs a browser tab — open any website, then try again. Your text is still on the clipboard.',
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
        message: `Your text is long — sending the first ${MAX_SELECTION_CHARS} characters.`,
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
        // The user typed text, so the blocker to explain is the missing tab, not the page.
        onNoTarget: () =>
          toastStore.push({
            message: 'The side panel needs a browser tab — open any website. Your text is kept.',
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

  onMount(async () => {
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
    // Picks up settings written by another surface, so the backend chip and the toaster theme stay in sync.
    settingsUnsub = onSettingsChanged((next) => {
      liveSettings = next;
      theme = next.theme;
    });
    try {
      varieties = await listVarieties();
    } catch (e) {
      debugCatch(e, 'popup.onMount.listVarieties');
    }
    // Restore draft BEFORE wiring autofill — draft wins over selection so
    // a half-typed thought doesn't get clobbered by a stray page selection.
    try {
      const draft = await readPopupDraft();
      if (draft !== null) {
        freeformText = draft.text;
        freeformExpanded = draft.expanded;
        if (draft.expanded) pendingFocus = true;
      }
    } catch (e) {
      debugCatch(e, 'popup.onMount.readDraft');
    }
    draftHydrated = true;
    // Anything typed before the reads finished has no input event left to save it.
    scheduleDraftSave();
    void prefillFromActiveTabSelection(freeformText).then((selText) => {
      // Re-read freeformText at write time — user may have typed between
      // draft restore and selection resolve. Don't clobber active input.
      if (selText !== null && freeformText === '') {
        prefilledText = selText;
        freeformText = selText;
        freeformExpanded = true;
        pendingFocus = true;
        scheduleDraftSave();
      }
    });
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

    <PopupLangPair
      {sourceLang}
      {targetLang}
      {varieties}
      swapDisabled={sourceLang === 'auto'}
      onSourceChange={(v) => void persistSourceLang(v)}
      onTargetChange={(v) => void persistTargetLang(v)}
      onSwap={() => {
        langTouched = true;
        void swapDirection();
      }}
    />

    {#if backendReady === false}
      <div class="popup-no-backend" role="status" data-ega-popup-no-backend>
        <p>
          Ega needs a model to translate with. Add an API key, or set up Ollama or the native host.
        </p>
        <Button variant="primary" onclick={() => openOptionsTab('backends')}
          >Set up a backend</Button
        >
      </div>
    {/if}

    <PopupTools
      onTranslatePage={() => void onTranslatePage()}
      onPickElement={() => void onPickElement()}
      onClipboard={() => void onClipboard()}
      onOpenSidePanel={() => void onOpenSidePanel()}
      {pickerEnabled}
    />

    <div class="popup-freeform">
      {#if !freeformExpanded}
        <button
          type="button"
          class="freeform-collapsed"
          data-ega-freeform-collapsed
          onclick={expandFreeform}
        >
          Translate something…
        </button>
      {:else}
        <textarea
          bind:this={freeformTextarea}
          bind:value={freeformText}
          class="freeform-textarea"
          dir="auto"
          data-ega-freeform-textarea
          aria-label="Text to translate"
          placeholder="Paste or type text…"
          oninput={scheduleDraftSave}
          onkeydown={onComposerKey}
          rows="3"></textarea>
        <div class="freeform-actions" data-ega-action-bar>
          <Button
            variant="primary"
            disabled={freeformText.trim().length === 0}
            onclick={() => void onSendFreeform()}>Open in side panel</Button
          >
        </div>
      {/if}
    </div>
  </AppShell>
</div>

<Toaster position="bottom-center" {theme} />

<style>
  .popup-root {
    display: contents;
  }
  .popup-header-slot {
    display: flex;
    align-items: center;
    width: 100%;
  }
  .popup-no-backend {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    font-size: var(--fs-sm);
  }
  .popup-no-backend p {
    margin: 0;
  }
  .popup-freeform {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-2);
  }
  .freeform-collapsed {
    width: 100%;
    text-align: left;
    padding: var(--space-3) var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-muted);
    cursor: text;
    font-size: var(--fs-sm);
  }
  .freeform-collapsed:hover {
    border-color: var(--color-accent);
    color: var(--color-fg);
  }
  .freeform-collapsed:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .freeform-textarea {
    width: 100%;
    min-height: 4.5rem;
    padding: var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-family: inherit;
    font-size: var(--fs-sm);
    resize: vertical;
  }
  .freeform-textarea:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .freeform-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
