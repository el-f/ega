<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Settings, Variety } from '@/shared/types';
  import { listVarieties } from '@/shared/varieties';
  import { getSettings, replaceSettings } from '@/shared/storage';
  import { exportVarieties } from '@/shared/storage/backup';
  import { importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { count } from '@/shared/utils/count';
  import { saveSettings, saveVia } from '@/options/storage-with-toast';
  import { makeAsyncLock } from '@/shared/utils/async-lock';
  import { toastStore } from '@/shared/components/toastStore';
  import { downloadJsonFile } from '@/shared/download-file';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import LangDefaultsSection from '@/options/components/sections/LangDefaultsSection.svelte';
  import LanguageDialog from '@/options/components/LanguageDialog.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
  import Search from '@lucide/svelte/icons/search';

  interface Props {
    /** Null while Options loads; the language dialog waits for it. */
    s?: Settings | null;
    onSetSettings?: (next: Settings) => void;
  }

  const { s = null, onSetSettings = () => {} }: Props = $props();

  let all: Variety[] = $state.raw([]);
  let query = $state('');
  /** The language the dialog edits; 'new' for an empty one. */
  let editing = $state<Variety | 'new' | null>(null);

  const sorted = $derived([...all].sort((a, b) => a.label.localeCompare(b.label)));
  const filtered = $derived(
    query.trim() === ''
      ? sorted
      : sorted.filter((v) => v.label.toLowerCase().includes(query.trim().toLowerCase())),
  );

  async function refresh(): Promise<void> {
    all = await listVarieties();
  }

  onMount(() => {
    void refresh();
  });

  // Two fast checkbox flips interleave their read-modify-write, so they queue behind the same tail promise storage uses.
  const toggleLock = makeAsyncLock();
  async function toggleShown(v: Variety): Promise<void> {
    await toggleLock(async () => {
      const before = await getSettings();
      const turningOff = !before.disabledVarieties.includes(v.id);
      const next = await saveVia(() =>
        replaceSettings((cur) => ({
          ...cur,
          disabledVarieties: turningOff
            ? [...new Set([...cur.disabledVarieties, v.id])]
            : cur.disabledVarieties.filter((id) => id !== v.id),
        })),
      );
      if (!next) return;
      onSetSettings(next);
      await refresh();
      const role = defaultRole(before, v.id);
      // An off language stays the default: the pickers hide it, but every request still uses it.
      if (turningOff && role) {
        toastStore.push({
          message: `${v.label} is your default ${role} language, so Ega still uses it. Pick another in Default languages.`,
          variant: 'warning',
        });
      }
    });
  }

  function defaultRole(cur: Settings, id: string): string | null {
    const source = cur.defaultLang === id;
    const target = cur.defaultTargetLang === id;
    if (source && target) return 'source and target';
    return source ? 'source' : target ? 'target' : null;
  }

  // The dialog's opener gets focus back when it closes.
  let opener: HTMLElement | null = null;
  function open(v: Variety | 'new', from: EventTarget | null): void {
    opener = from instanceof HTMLElement ? from : null;
    editing = v;
  }
  async function closeDialog(): Promise<void> {
    const wasNew = editing === 'new';
    editing = null;
    await refresh();
    await tick();
    // A deleted language takes its Edit button with it; the card's Add language is the next stop.
    if (opener?.isConnected === true) opener.focus();
    else if (!wasNew) document.querySelector<HTMLElement>('[data-ega-language-add]')?.focus();
  }

  async function clearFilter(): Promise<void> {
    query = '';
    await tick();
    document.querySelector<HTMLInputElement>('[data-ega-variety-filter] input')?.focus();
  }

  let backupState = $state<ImportStatus | null>(null);

  async function doExportVarieties(): Promise<void> {
    backupState = null;
    try {
      const bundle = await exportVarieties();
      downloadJsonFile(`ega-varieties-${new Date().toISOString().slice(0, 10)}.json`, bundle);
      backupState = {
        kind: 'ok',
        msg: `Exported ${count(bundle.egaVarieties.customLanguages.length, 'custom language')}, ${count(Object.keys(bundle.egaVarieties.varietyOverrides).length, 'override')}`,
      };
    } catch (e) {
      backupState = { kind: 'err', msg: `Export failed: ${(e as Error).message}` };
    }
  }

  async function doImportVarieties(file: File): Promise<void> {
    backupState = null;
    const status = await importBundleFile(file, ['varieties', 'language']);
    if (!status) return;
    backupState = status;
    if (status.kind === 'ok') {
      await refresh();
      const next = await getSettings();
      onSetSettings(next);
    }
  }
</script>

<TabHeader tab="languages" />

{#if s}
  <LangDefaultsSection
    {s}
    varieties={all}
    onPatch={async (p) => {
      const next = await saveSettings(p);
      if (next) onSetSettings(next);
    }}
  />
{/if}

<SectionCard
  title="Slang and special languages"
  description="Shown in the language pickers next to the standard languages"
  info={{
    label: 'About these languages',
    text: 'Standard languages such as Spanish or Hebrew are always available. These extra ones carry notes and examples that teach the model a style of writing.',
  }}
>
  {#snippet headerActions()}
    <Button
      variant="secondary"
      size="sm"
      iconKind="add"
      dataAttrs={{ 'data-ega-language-add': true }}
      onclick={(e) => open('new', e.currentTarget)}>Add language</Button
    >
  {/snippet}

  <div class="variety-filter" data-ega-variety-filter>
    <Input bind:value={query} ariaLabel="Filter languages" placeholder="Filter languages" size="sm">
      {#snippet leading()}<Search size={16} />{/snippet}
    </Input>
  </div>

  {#if filtered.length === 0 && query.trim() !== ''}
    <div class="variety-empty" role="status">
      <span>No language matches "{query.trim()}"</span>
      <Button variant="ghost" size="sm" onclick={() => void clearFilter()}>Clear filter</Button>
    </div>
  {:else}
    <ul class="variety-list">
      {#each filtered as v (v.id)}
        <li class="variety-row" data-ega-variety-row={v.id}>
          <Checkbox
            id="enable-{v.id}"
            checked={!v.disabled}
            label={v.label}
            inputAttrs={{ 'aria-label': `Show ${v.label} in language pickers` }}
            onchange={() => void toggleShown(v)}
          />
          {#if v.kind === 'custom'}
            <Badge variant="muted">Custom</Badge>
          {:else if v.hasOverrides}
            <Badge variant="muted">Edited</Badge>
          {/if}
          <span class="variety-count">{count(v.examples.length, 'example')}</span>
          <Button
            variant="ghost"
            size="sm"
            ariaLabel={`Edit ${v.label}`}
            dataAttrs={{ 'data-ega-variety-edit': v.id }}
            onclick={(e) => open(v, e.currentTarget)}>Edit</Button
          >
        </li>
      {/each}
    </ul>
  {/if}
</SectionCard>

<SectionCard
  title="Backup and restore"
  description="Your custom languages, edits and language prompts"
  info={{
    label: 'About this backup',
    text: 'Import adds languages from a file and updates the ones you already have.',
  }}
>
  <BackupRestoreRow
    onExport={doExportVarieties}
    onImport={doImportVarieties}
    status={backupState}
    scope="languages"
  />
</SectionCard>

{#if editing && s}
  <!-- Keyed: each language gets a fresh dialog, so a draft never carries over to another. -->
  {#key editing}
    <LanguageDialog
      {s}
      language={editing === 'new' ? null : editing}
      onClose={() => void closeDialog()}
      onSaved={(next) => {
        if (next) onSetSettings(next);
        void refresh();
      }}
    />
  {/key}
{/if}

<style>
  .variety-filter {
    margin: 0 0 var(--space-2);
  }
  .variety-empty {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .variety-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* Rows sit in the card, so a hairline sets them apart, not a box. */
  .variety-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding-block: var(--space-1);
  }
  .variety-row + .variety-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .variety-row > :global(.ega-checkbox) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .variety-count {
    flex: 1 1 auto;
    text-align: end;
    color: var(--color-muted);
    font-size: var(--fs-base);
    font-variant-numeric: tabular-nums;
  }
</style>
