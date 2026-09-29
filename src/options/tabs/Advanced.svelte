<script lang="ts">
  import { onMount } from 'svelte';
  import { getSettings, exportAll, exportTaskPresets, replaceSitePrefs } from '@/shared/storage';
  import { count, importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { saveSettings, saveVia } from '@/options/storage-with-toast';
  import { downloadJsonFile } from '@/shared/download-file';
  import { DEFAULT_TEMPLATE } from '@/shared/prompts';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import type { Settings, BackendId } from '@/shared/types';
  import type { Task } from '@/shared/task-prompts';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import TabHeader from '@/shared/components/TabHeader.svelte';

  import AdvancedSubTabs, { type SubTabId } from '@/options/components/AdvancedSubTabs.svelte';
  import { SETTINGS_REGISTRY } from '@/shared/settings-registry';
  import { DEEP_LINK_EVENT, advancedSubTabFor, readPendingDeepLink } from '@/options/deep-link';
  import AdvancedDiagnosticsPane from '@/options/components/AdvancedDiagnosticsPane.svelte';
  import AdvancedDataPane from '@/options/components/AdvancedDataPane.svelte';
  import LabsSection from '@/options/components/sections/LabsSection.svelte';

  import { getRegisteredBackendIds } from '@/shared/backends/registry';

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
      if (raw === 'diagnostics' || raw === 'data' || raw === 'labs') return raw;
    } catch {
      // sandbox sessionStorage may throw; fall through
    }
    return pendingSubTab() ?? 'diagnostics';
  }

  let activeSubTab: SubTabId = $state(readSubTab());

  // One pass over SETTINGS_REGISTRY feeds the modified-count pill on every sub-tab trigger.
  const VALID_SUB_TABS: readonly SubTabId[] = ['diagnostics', 'data', 'labs'];
  // Partition once per mount so modifiedBySubTab does not re-scan ~90 entries on every settings change.
  const ADVANCED_ENTRIES = SETTINGS_REGISTRY.filter((e) => e.tab === 'advanced');
  const modifiedBySubTab = $derived.by((): Record<SubTabId, number> => {
    const out: Record<SubTabId, number> = {
      diagnostics: 0,
      data: 0,
      labs: 0,
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

  // One row can own both the https and the http key for a host — clear them together.
  async function clearSiteKeys(keys: readonly string[]): Promise<void> {
    if (!s) return;
    const saved = await saveVia(() =>
      replaceSitePrefs((cur) => {
        const next = { ...cur };
        for (const key of keys) delete next[key];
        return next;
      }),
    );
    if (saved) onSetSettings(saved);
  }
  async function clearAllSitePrefs(): Promise<void> {
    const saved = await saveVia(() => replaceSitePrefs({}));
    if (saved) onSetSettings(saved);
  }

  // Backend fallback chain (per task) — used by LabsSection.
  async function setTaskBackendChain(task: Task, chain: readonly string[]): Promise<void> {
    if (!s) return;
    const current = { ...s.advanced.taskBackendChains };
    if (chain.length === 0) delete current[task];
    else current[task] = [...chain] as BackendId[];
    await patchAdvanced({ taskBackendChains: current });
  }

  const BACKEND_IDS = getRegisteredBackendIds();

  // Reset Advanced settings (template, sampling, per-site overrides) to defaults
  async function resetAllToDefaults(): Promise<void> {
    if (!s) return;
    const confirmed = await confirmDialog({
      title: 'Reset Advanced settings',
      body: 'Reset prompt template, temperature, max tokens, and per-site overrides to defaults. Per-language prompt overrides and API keys are not affected. Type RESET to confirm.',
      confirmLabel: 'Reset',
      danger: true,
      typeToConfirm: 'RESET',
    });
    if (!confirmed) return;
    const def = DEFAULT_SETTINGS.advanced;
    await patchAdvanced({
      promptTemplate: { ...DEFAULT_TEMPLATE },
      temperature: def.temperature,
      maxTokens: def.maxTokens,
    });
    await saveVia(() => replaceSitePrefs({}));
    onSetSettings(await getSettings());
    toastStore.push({ message: 'Defaults restored', variant: 'success' });
  }

  async function unifiedExport(scope: 'all' | 'taskPresets', includeKeys: boolean): Promise<void> {
    backupStatus = null;
    try {
      if (scope === 'all') {
        const bundle = await exportAll({ includeApiKeys: includeKeys });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadJsonFile(`ega-settings-${stamp}.json`, bundle);
        backupStatus = {
          kind: 'ok',
          msg: includeKeys
            ? 'Exported (including API keys — treat the file like a password)'
            : 'Exported (API keys stripped). The file still holds your glossary, custom-language examples, and your site-override host list.',
        };
      } else {
        const bundle = await exportTaskPresets();
        downloadJsonFile(`ega-task-presets-${new Date().toISOString().slice(0, 10)}.json`, bundle);
        backupStatus = {
          kind: 'ok',
          msg:
            `Exported ${count(Object.keys(bundle.egaTaskPresets.taskTemplates).length, 'template')}, ` +
            `${count(Object.keys(bundle.egaTaskPresets.taskBackends).length, 'backend pin')}, ` +
            `${count(Object.keys(bundle.egaTaskPresets.taskTemperatures).length, 'temperature')}.`,
        };
      }
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
          onUnifiedExport={unifiedExport}
          onUnifiedImport={unifiedImport}
          onClearSiteKeys={clearSiteKeys}
          onClearAllSitePrefs={clearAllSitePrefs}
          onResetAllToDefaults={resetAllToDefaults}
        />
      {:else if activeSubTab === 'labs'}
        <section data-ega-subtab="labs">
          <LabsSection
            {s}
            backendIds={BACKEND_IDS}
            onPatchAdvanced={patchAdvanced}
            onSetTaskBackendChain={setTaskBackendChain}
          />
        </section>
      {/if}
    </div>
  </div>
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
