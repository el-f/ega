<script lang="ts" module>
  import { ISO_LANGUAGES } from '@/shared/languages';

  // Empty string = any-lang scope (most common case).
  const ANY_OPTION = { value: '', label: 'Any' };
  const ISO_OPTIONS = ISO_LANGUAGES.map((l) => ({ value: l.code, label: l.label }));
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import { toastStore } from '@/shared/components/toastStore';
  import { getSettings, replaceSettings } from '@/shared/storage';
  import { reportSaveFailure } from '@/options/storage-with-toast';
  import { makeAsyncLock } from '@/shared/utils/async-lock';
  import { asLangIdUnsafe } from '@/shared/brands';
  import { listVarieties } from '@/shared/varieties';
  import { GLOSSARY_MAX } from '@/shared/settings-schema';
  import { exportGlossary } from '@/shared/storage/backup';
  import { count, importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { downloadJsonFile } from '@/shared/download-file';
  import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
  import type { Settings, LangSelection, Variety } from '@/shared/types';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  type GlossaryEntry = Settings['glossary'][number];

  let entries: GlossaryEntry[] = $state([]);
  let draft: {
    term: string;
    translation: string;
    sourceLang: string;
    targetLang: string;
    caseSensitive: boolean;
  } = $state({
    term: '',
    translation: '',
    sourceLang: '',
    targetLang: '',
    caseSensitive: false,
  });
  let query = $state('');
  let saveError: string | null = $state(null);
  let varieties: Variety[] = $state([]);

  // Scope is compared against the request's own source/target id, so a variety id and 'auto' are both reachable values.
  const varietyOptions = $derived(
    varieties.filter((v) => !v.disabled).map((v) => ({ value: v.id, label: v.label })),
  );
  const sourceOptions = $derived([
    ANY_OPTION,
    { value: 'auto', label: 'Auto-detect' },
    ...varietyOptions,
    ...ISO_OPTIONS,
  ]);
  const targetOptions = $derived([ANY_OPTION, ...varietyOptions, ...ISO_OPTIONS]);

  // A custom variety id is a UUID, so the row shows its label instead.
  function scopeLabel(id: string | undefined): string {
    if (!id) return 'any';
    return varieties.find((v) => v.id === id)?.label ?? id;
  }

  const writeLock = makeAsyncLock();

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return entries;
    return entries.filter(
      (e) => e.term.toLowerCase().includes(q) || e.translation.toLowerCase().includes(q),
    );
  });

  async function refresh(): Promise<void> {
    const s = await getSettings();
    entries = [...s.glossary];
  }

  onMount(() => {
    void refresh();
    void listVarieties().then((vs) => (varieties = vs));
  });

  function clampLangSelection(raw: string): LangSelection | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    // Schema brands at parse; runtime carrier is opaque so the unsafe brand is fine here.
    return asLangIdUnsafe(trimmed);
  }

  const LIMIT_MESSAGE = `Glossary limit is ${GLOSSARY_MAX} entries — delete one before adding another.`;

  class SkippedWrite extends Error {
    reason: 'full' | 'unchanged';
    constructor(reason: 'full' | 'unchanged') {
      super(reason);
      this.reason = reason;
    }
  }

  // Read-modify-write inside the settings lock, so a change another surface made since this tab's read survives.
  async function writeGlossary(
    apply: (cur: GlossaryEntry[]) => GlossaryEntry[] | 'full' | 'unchanged',
  ): Promise<'saved' | 'full' | 'unchanged' | 'failed'> {
    try {
      await replaceSettings((cur) => {
        const next = apply(cur.glossary);
        if (typeof next === 'string') throw new SkippedWrite(next);
        return { ...cur, glossary: next };
      });
      return 'saved';
    } catch (e) {
      if (e instanceof SkippedWrite) return e.reason;
      reportSaveFailure(e);
      return 'failed';
    } finally {
      await refresh();
    }
  }

  function sameEntry(a: GlossaryEntry, b: GlossaryEntry): boolean {
    return (
      a.term === b.term &&
      a.translation === b.translation &&
      a.caseSensitive === b.caseSensitive &&
      a.sourceLang === b.sourceLang &&
      a.targetLang === b.targetLang
    );
  }

  async function addEntry(): Promise<void> {
    saveError = null;
    const term = draft.term.trim();
    const translation = draft.translation.trim();
    if (!term || !translation) return;
    if (term.length > 100) {
      saveError = 'Term is too long (max 100 characters).';
      return;
    }
    if (translation.length > 100) {
      saveError = 'Translation is too long (max 100 characters).';
      return;
    }
    const sourceLang = clampLangSelection(draft.sourceLang);
    const targetLang = clampLangSelection(draft.targetLang);
    const entry: GlossaryEntry = {
      term,
      translation,
      caseSensitive: draft.caseSensitive,
      ...(sourceLang !== undefined ? { sourceLang } : {}),
      ...(targetLang !== undefined ? { targetLang } : {}),
    };
    const result = await writeLock(() =>
      writeGlossary((cur) => (cur.length >= GLOSSARY_MAX ? 'full' : [...cur, entry])),
    );
    if (result === 'full') saveError = LIMIT_MESSAGE;
    if (result !== 'saved') return;
    draft = { term: '', translation: '', sourceLang: '', targetLang: '', caseSensitive: false };
  }

  // Position is not identity: another surface can rewrite the glossary while this tab sits open.
  async function removeEntry(entry: GlossaryEntry): Promise<void> {
    let removedAt = -1;
    const result = await writeLock(() =>
      writeGlossary((cur) => {
        removedAt = cur.findIndex((g) => sameEntry(g, entry));
        return removedAt < 0 ? 'unchanged' : cur.filter((_, i) => i !== removedAt);
      }),
    );
    if (result !== 'saved') return;
    toastStore.push({
      message: `Removed "${entry.term}".`,
      variant: 'success',
      action: { label: 'Undo', onClick: () => void restoreEntry(entry, removedAt) },
    });
  }

  let shareStatus = $state<ImportStatus | null>(null);

  async function doExport(): Promise<void> {
    shareStatus = null;
    try {
      const bundle = await exportGlossary();
      downloadJsonFile(`ega-glossary-${new Date().toISOString().slice(0, 10)}.json`, bundle);
      shareStatus = {
        kind: 'ok',
        msg: `Exported ${count(bundle.egaGlossary.entries.length, 'entry', 'entries')}.`,
      };
    } catch (e) {
      shareStatus = { kind: 'err', msg: `Export failed: ${(e as Error).message}` };
    }
  }

  async function doImport(file: File): Promise<void> {
    shareStatus = null;
    const status = await importBundleFile(file, 'glossary');
    if (!status) return;
    shareStatus = status;
    if (status.kind === 'ok') await refresh();
  }

  async function restoreEntry(entry: GlossaryEntry, at: number): Promise<void> {
    const result = await writeLock(() =>
      writeGlossary((cur) => {
        if (cur.length >= GLOSSARY_MAX) return 'full';
        const next = [...cur];
        next.splice(Math.min(at, next.length), 0, entry);
        return next;
      }),
    );
    if (result === 'full') saveError = LIMIT_MESSAGE;
  }
</script>

<TabHeader tab="glossary" />

<SectionCard
  title="Backup & restore"
  description="Share your glossary as a file. Import adds only the terms you do not have yet."
>
  <BackupRestoreRow onExport={doExport} onImport={doImport} status={shareStatus} scope="glossary" />
</SectionCard>

<SectionCard title="Add entry">
  <div class="glossary-add" data-ega-glossary-add>
    <Input bind:value={draft.term} label="Term" placeholder="Firebolt" />
    <Input bind:value={draft.translation} label="Translation" placeholder="Saeta de Fuego" />
    <label class="glossary-lang-field">
      <span>Source language</span>
      <Select
        bind:value={draft.sourceLang}
        options={sourceOptions}
        ariaLabel="Source language scope"
      />
    </label>
    <label class="glossary-lang-field">
      <span>Target language</span>
      <Select
        bind:value={draft.targetLang}
        options={targetOptions}
        ariaLabel="Target language scope"
      />
    </label>
    <Checkbox
      id="glossary-case-sensitive"
      bind:checked={draft.caseSensitive}
      ariaLabel="Case-sensitive match"
      label="Match case"
    />
    <p class="glossary-scope-help" data-ega-glossary-scope-help>
      Scope matches the language picked for the request, not the detected one. While the source is
      Auto-detect, only entries scoped to Any or Auto-detect apply.
    </p>
    <div class="glossary-add-row">
      <Button
        variant="primary"
        iconKind="add"
        disabled={!draft.term.trim() || !draft.translation.trim()}
        onclick={addEntry}
      >
        Add entry
      </Button>
      {#if saveError}
        <span class="glossary-error" role="alert">{saveError}</span>
      {/if}
    </div>
  </div>
</SectionCard>

<SectionCard title="Entries">
  {#if entries.length === 0}
    <EmptyState
      title="No glossary entries"
      description="Add brand names, character names, or technical jargon here so they translate consistently."
      icon="📒"
    />
  {:else}
    {#if entries.length > 10}
      <div class="glossary-filter">
        <Input
          bind:value={query}
          placeholder="Filter entries…"
          ariaLabel="Filter glossary entries"
          size="sm"
          type="search"
        />
      </div>
    {/if}
    <ul class="glossary-list" data-ega-glossary-list>
      {#each filtered as e (e)}
        <li class="glossary-row">
          <div class="glossary-cell glossary-cell-term" dir="auto"><b>{e.term}</b></div>
          <div class="glossary-cell glossary-cell-arrow" aria-hidden="true">→</div>
          <div class="glossary-cell glossary-cell-translation" dir="auto">{e.translation}</div>
          <div class="glossary-cell glossary-cell-scope">
            <span>{scopeLabel(e.sourceLang)}</span>
            <span aria-hidden="true">→</span>
            <span>{scopeLabel(e.targetLang)}</span>
          </div>
          <div class="glossary-cell glossary-cell-flags">
            {#if e.caseSensitive}<span class="badge">Aa</span>{/if}
          </div>
          <div class="glossary-cell glossary-cell-actions">
            <IconButton
              icon={Trash2}
              ariaLabel="Delete entry {e.term}"
              tooltip="Delete"
              size="sm"
              variant="danger"
              onclick={() => void removeEntry(e)}
            />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</SectionCard>

<style>
  .glossary-add {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-2);
    align-items: end;
  }
  .glossary-lang-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-fg);
    /* The global label rule belongs on the text, as on Input labels, not on the wrapper and its select. */
    margin: 0;
    opacity: 1;
  }
  .glossary-lang-field > span {
    margin: var(--space-2) 0 var(--space-1);
    opacity: 0.8;
  }
  .glossary-scope-help {
    grid-column: 1 / -1;
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .glossary-add-row {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .glossary-error {
    color: var(--color-danger-fg);
    font-size: var(--fs-sm);
  }
  .glossary-filter {
    margin-bottom: var(--space-2);
  }
  .glossary-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .glossary-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto auto auto;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
    font-size: var(--fs-sm);
  }
  .glossary-cell-arrow {
    color: var(--color-muted);
  }
  .glossary-cell-scope {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--color-bg-hover);
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  @media (max-width: 600px) {
    .glossary-row {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'term actions'
        'translation translation'
        'scope flags';
    }
    .glossary-cell-term {
      grid-area: term;
    }
    .glossary-cell-arrow {
      display: none;
    }
    .glossary-cell-translation {
      grid-area: translation;
    }
    .glossary-cell-scope {
      grid-area: scope;
    }
    .glossary-cell-flags {
      grid-area: flags;
    }
    .glossary-cell-actions {
      grid-area: actions;
    }
  }
</style>
