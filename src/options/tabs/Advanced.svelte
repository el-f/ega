<script lang="ts">
  import { onMount } from 'svelte';
  import { clearAllStorage, getSettings } from '@/shared/storage';
  import { exportAll } from '@/shared/storage/backup';
  import { importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { saveSettings } from '@/options/storage-with-toast';
  import { downloadJsonFile } from '@/shared/download-file';
  import { DEFAULT_TEMPLATE } from '@/shared/prompts';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import type { Settings } from '@/shared/types';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import { toastStore } from '@/shared/components/toastStore';
  import { debugCatch } from '@/shared/logger';
  import { OPTIONS_LOCAL_UI_KEYS } from '@/options/local-ui-keys';
  import DeleteAllDataDialog from '@/options/components/DeleteAllDataDialog.svelte';
  import TabHeader from '@/shared/components/TabHeader.svelte';

  import AdvancedSubTabs, { type SubTabId } from '@/options/components/AdvancedSubTabs.svelte';
  import { SETTINGS_REGISTRY } from '@/shared/settings-registry';
  import { DEEP_LINK_EVENT, advancedSubTabFor, readPendingDeepLink } from '@/options/deep-link';
  import AdvancedDiagnosticsPane from '@/options/components/AdvancedDiagnosticsPane.svelte';
  import AdvancedDataPane from '@/options/components/AdvancedDataPane.svelte';

  interface Props {
    s: Settings | null;
    onSetSettings: (next: Settings) => void;
  }

  const { s, onSetSettings }: Props = $props();

  let backupStatus: ImportStatus | null = $state(null);

  const SUBTAB_KEY = 'ega-advanced-subtab';

  function pendingSubTab(): SubTabId | null {
    const target = readPendingDeepLink();
    return target ? advancedSubTabFor(target) : null;
  }

  function readSubTab(): SubTabId {
    try {
      const raw = sessionStorage.getItem(SUBTAB_KEY);
      if (raw === 'diagnostics' || raw === 'data') return raw;
    } catch {
      // sandbox sessionStorage may throw; fall through
    }
    return pendingSubTab() ?? 'data';
  }

  let activeSubTab: SubTabId = $state(readSubTab());

  // One pass over SETTINGS_REGISTRY feeds the modified-count pill on every sub-tab trigger.
  const VALID_SUB_TABS: readonly SubTabId[] = ['data', 'diagnostics'];
  // Partition once per mount so modifiedBySubTab does not re-scan ~90 entries on every settings change.
  const ADVANCED_ENTRIES = SETTINGS_REGISTRY.filter((e) => e.tab === 'advanced');
  const modifiedBySubTab = $derived.by((): Record<SubTabId, number> => {
    const out: Record<SubTabId, number> = {
      diagnostics: 0,
      data: 0,
    };
    const cur = s;
    if (!cur) return out;
    for (const entry of ADVANCED_ENTRIES) {
      const rawSub = entry.subTab;
      if (!rawSub || !VALID_SUB_TABS.includes(rawSub)) continue;
      if (entry.isModified?.(cur)) out[rawSub] += 1;
    }
    return out;
  });

  $effect(() => {
    try {
      sessionStorage.setItem(SUBTAB_KEY, activeSubTab);
    } catch {
      // Sandboxed sessionStorage throws; the value is only a convenience.
    }
  });

  // Only the sub-tab switch lives here; deep-link.ts owns the scroll once this pane paints.
  const deepLinkHandler = (): void => {
    const sub = pendingSubTab();
    if (sub) activeSubTab = sub;
  };
  onMount(() => {
    deepLinkHandler();
    document.addEventListener(DEEP_LINK_EVENT, deepLinkHandler);
    return () => document.removeEventListener(DEEP_LINK_EVENT, deepLinkHandler);
  });

  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });
  const { patchAdvanced } = handlers;

  async function patchField<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const next = await saveSettings({ [key]: value } as Partial<Settings>);
    if (next) onSetSettings(next);
  }

  // Acts at once with Undo; site overrides have their own card and are not touched.
  async function resetPromptAndModel(): Promise<void> {
    if (!s) return;
    const prior = {
      promptTemplate: s.advanced.promptTemplate,
      temperature: s.advanced.temperature,
      maxTokens: s.advanced.maxTokens,
      effort: s.advanced.effort,
    };
    const def = DEFAULT_SETTINGS.advanced;
    await patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      temperature: def.temperature,
      maxTokens: def.maxTokens,
      effort: def.effort,
    });
    toastStore.push({
      message: 'Prompt and model settings are back to defaults',
      variant: 'success',
      action: { label: 'Undo', onClick: () => void patchAdvanced(prior) },
    });
  }

  async function clearCache(): Promise<void> {
    try {
      // The live cache is an in-memory Map in the service worker.
      await chrome.runtime.sendMessage({ kind: 'cache:clear' });
      toastStore.push({ message: 'Saved answers cleared', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'options.tabs.Advanced.clearCache');
      toastStore.push({
        message: 'Saved answers were not cleared. Chrome did not take the change.',
        variant: 'danger',
        action: { label: 'Try again', onClick: () => void clearCache() },
      });
    }
  }

  let deleteOpen = $state(false);
  async function deleteAllData(): Promise<void> {
    deleteOpen = false;
    try {
      // A reply finishing after the wipe would write its thread back; an asleep worker must not stop it.
      await chrome.runtime.sendMessage({ kind: 'translate:cancel-all' }).catch(() => {});
      await clearAllStorage();
      await chrome.runtime.sendMessage({ kind: 'audit:clear' });
      await chrome.runtime.sendMessage({ kind: 'cache:clear' });
      for (const key of OPTIONS_LOCAL_UI_KEYS) globalThis.localStorage?.removeItem(key);
    } catch (e) {
      debugCatch(e, 'options.tabs.Advanced.deleteAllData');
      toastStore.push({
        message: `Some data was not deleted: ${(e as Error).message}. Press Delete all data again.`,
        variant: 'danger',
        action: { label: 'Try again', onClick: () => (deleteOpen = true) },
      });
      return;
    }
    // This page still holds the old settings in memory; a reload starts it clean.
    location.reload();
  }

  async function exportSettings(includeKeys: boolean): Promise<void> {
    backupStatus = null;
    try {
      const bundle = await exportAll({ includeApiKeys: includeKeys });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJsonFile(`ega-settings-${stamp}.json`, bundle);
      backupStatus = {
        kind: 'ok',
        msg: includeKeys
          ? 'Exported all settings with API keys. Treat the file like a password.'
          : 'Exported all settings without API keys. The file still holds your glossary, custom-language examples, your own task prompts and your site-override host list.',
      };
    } catch (e) {
      backupStatus = { kind: 'err', msg: `Export failed: ${(e as Error).message}` };
    }
  }
  async function unifiedImport(file: File): Promise<void> {
    backupStatus = null;
    const status = await importBundleFile(file);
    if (!status) return;
    backupStatus = status;
    if (status.kind === 'ok') onSetSettings(await getSettings());
  }
</script>

{#if !s}
  <LoadingState rows={6} label="Loading advanced settings…" />
{:else}
  <div class="advanced-root">
    <TabHeader tab="advanced" />

    <AdvancedSubTabs
      active={activeSubTab}
      modifiedCounts={modifiedBySubTab}
      onSelect={(id) => {
        activeSubTab = id;
        queueMicrotask(() => {
          const el = document.querySelector(`[data-ega-subtab="${id}"]`);
          if (el instanceof HTMLElement) {
            el.setAttribute('data-ega-flash', 'true');
            setTimeout(() => el.removeAttribute('data-ega-flash'), 620);
          }
        });
      }}
    />

    <div
      class="adv-pane"
      role="tabpanel"
      id={`adv-pane-${activeSubTab}`}
      aria-labelledby={`adv-subtab-${activeSubTab}`}
      tabindex="0"
    >
      {#if activeSubTab === 'diagnostics'}
        <AdvancedDiagnosticsPane {s} onPatchField={patchField} onPatchAdvanced={patchAdvanced} />
      {:else if activeSubTab === 'data'}
        <AdvancedDataPane
          {s}
          {backupStatus}
          onExport={exportSettings}
          onUnifiedImport={unifiedImport}
          onSaved={onSetSettings}
          onReset={resetPromptAndModel}
          onClearCache={clearCache}
          onDeleteAll={() => (deleteOpen = true)}
        />
      {/if}
    </div>
  </div>
  {#if deleteOpen}
    <DeleteAllDataDialog
      onConfirm={() => void deleteAllData()}
      onCancel={() => (deleteOpen = false)}
      onExport={() => exportSettings(false)}
    />
  {/if}
{/if}

<style>
  .advanced-root {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .adv-pane {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
</style>
