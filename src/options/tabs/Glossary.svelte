<script lang="ts" module>
  import { ISO_LANGUAGES } from '@/shared/languages';

  // Empty string = any-lang scope (most common case).
  const ANY_OPTION = { value: '', label: 'Any' };
  const ISO_OPTIONS = ISO_LANGUAGES.map((l) => ({ value: l.code, label: l.label }));
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
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
  import { GLOSSARY_FIELD_MAX, GLOSSARY_MAX } from '@/shared/settings-schema';
  import { exportGlossary, sameTerm } from '@/shared/storage/backup';
  import { importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { count } from '@/shared/utils/count';
  import { downloadJsonFile } from '@/shared/download-file';
  import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
  import type { Settings, LangSelection, Variety } from '@/shared/types';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import BookText from '@lucide/svelte/icons/book-text';
  import { openOptionsTab } from '@/shared/open-options-tab';

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
  /** The row loaded into the form. Set while editing; null while adding. */
  let editing: GlossaryEntry | null = $state(null);
  let formEl = $state<HTMLDivElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);
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
    reason: 'full' | 'unchanged' | 'duplicate';
    constructor(reason: 'full' | 'unchanged' | 'duplicate') {
      super(reason);
      this.reason = reason;
    }
  }

  // Read-modify-write inside the settings lock, so a change another surface made since this tab's read survives.
  async function writeGlossary(
    apply: (cur: GlossaryEntry[]) => GlossaryEntry[] | 'full' | 'unchanged' | 'duplicate',
  ): Promise<'saved' | 'full' | 'unchanged' | 'duplicate' | 'failed'> {
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

  // Same scope and the same term by the rule import uses; case only separates two entries when both match case.
  function isDuplicate(a: GlossaryEntry, b: GlossaryEntry): boolean {
    return a.sourceLang === b.sourceLang && a.targetLang === b.targetLang && sameTerm(a, b);
  }

  const DUPLICATE_MESSAGE = 'This term is already in the glossary for that language scope.';

  function resetForm(): void {
    editing = null;
    saveError = null;
    draft = { term: '', translation: '', sourceLang: '', targetLang: '', caseSensitive: false };
  }

  // Save entry and Cancel unmount with the edit mode, so focus goes to the form's first field.
  async function leaveEdit(): Promise<void> {
    resetForm();
    await tick();
    formEl?.querySelector<HTMLInputElement>('input')?.focus();
  }

  async function startEdit(entry: GlossaryEntry): Promise<void> {
    saveError = null;
    editing = entry;
    draft = {
      term: entry.term,
      translation: entry.translation,
      sourceLang: entry.sourceLang ?? '',
      targetLang: entry.targetLang ?? '',
      caseSensitive: entry.caseSensitive,
    };
    await tick();
    formEl?.scrollIntoView({ block: 'nearest' });
    formEl?.querySelector<HTMLInputElement>('input')?.focus();
  }

  async function addEntry(): Promise<void> {
    saveError = null;
    const term = draft.term.trim();
    const translation = draft.translation.trim();
    if (!term || !translation) return;
    if (term.length > GLOSSARY_FIELD_MAX) {
      saveError = `Term is too long (max ${GLOSSARY_FIELD_MAX} characters).`;
      return;
    }
    if (translation.length > GLOSSARY_FIELD_MAX) {
      saveError = `Translation is too long (max ${GLOSSARY_FIELD_MAX} characters).`;
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
    const original = editing;
    if (original && sameEntry(original, entry)) {
      await leaveEdit();
      return;
    }
    const result = await writeLock(() =>
      writeGlossary((cur) => {
        if (!original) {
          if (cur.length >= GLOSSARY_MAX) return 'full';
          return cur.some((g) => isDuplicate(g, entry)) ? 'duplicate' : [...cur, entry];
        }
        const at = cur.findIndex((g) => sameEntry(g, original));
        if (at < 0) return 'unchanged';
        // A near-duplicate the original already had (cs "Apple" beside ci "apple") must not block editing it.
        if (cur.some((g, i) => i !== at && isDuplicate(g, entry) && !isDuplicate(g, original)))
          return 'duplicate';
        return cur.map((g, i) => (i === at ? entry : g));
      }),
    );
    if (result === 'full') saveError = LIMIT_MESSAGE;
    if (result === 'duplicate') saveError = DUPLICATE_MESSAGE;
    if (result === 'unchanged') {
      saveError = 'This entry changed in another window. Cancel, then edit it again.';
    }
    if (result !== 'saved') return;
    if (original) await leaveEdit();
    else resetForm();
  }

  // Position is not identity: another surface can rewrite the glossary while this tab sits open.
  async function removeEntry(entry: GlossaryEntry): Promise<void> {
    const shownAt = filtered.indexOf(entry);
    let removedAt = -1;
    const result = await writeLock(() =>
      writeGlossary((cur) => {
        removedAt = cur.findIndex((g) => sameEntry(g, entry));
        return removedAt < 0 ? 'unchanged' : cur.filter((_, i) => i !== removedAt);
      }),
    );
    // Every write rebuilds the entries, so every row remounts and the pressed button is gone; the row now in its place takes focus.
    await tick();
    const deletes =
      listEl?.querySelectorAll<HTMLElement>('button[aria-label^="Delete entry "]') ?? [];
    (
      deletes[Math.min(shownAt, deletes.length - 1)] ??
      formEl?.querySelector<HTMLInputElement>('input')
    )?.focus();
    if (result !== 'saved') return;
    if (editing && sameEntry(editing, entry)) resetForm();
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

<SectionCard title={editing ? 'Edit entry' : 'Add entry'}>
  <div class="glossary-add" data-ega-glossary-add bind:this={formEl}>
    <Input
      bind:value={draft.term}
      label="Term"
      placeholder="Firebolt"
      maxlength={GLOSSARY_FIELD_MAX}
    />
    <Input
      bind:value={draft.translation}
      label="Translation"
      placeholder="Saeta de Fuego"
      maxlength={GLOSSARY_FIELD_MAX}
    />
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
    <Checkbox id="glossary-case-sensitive" bind:checked={draft.caseSensitive} label="Match case" />
    <p class="glossary-scope-help" data-ega-glossary-scope-help>
      Scope matches the language picked for the request, not the detected one. While the source is
      Auto-detect, only entries scoped to Any or Auto-detect apply. Entries apply to every task that
      has Use glossary on;
      <button type="button" class="glossary-link" onclick={() => openOptionsTab('tasks')}>
        set that per task on the Tasks tab</button
      >.
    </p>
    <div class="glossary-add-row">
      {#if editing}
        <Button
          variant="primary"
          disabled={!draft.term.trim() || !draft.translation.trim()}
          onclick={addEntry}
        >
          Save entry
        </Button>
        <Button variant="secondary" onclick={() => void leaveEdit()}>Cancel</Button>
      {:else}
        <Button
          variant="primary"
          iconKind="add"
          disabled={!draft.term.trim() || !draft.translation.trim()}
          onclick={addEntry}
        >
          Add entry
        </Button>
      {/if}
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
      icon={BookText}
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
    <ul class="glossary-list" data-ega-glossary-list bind:this={listEl}>
      {#each filtered as e (e)}
        <li class="glossary-row" class:is-editing={editing !== null && sameEntry(editing, e)}>
          <div class="glossary-cell glossary-cell-term" dir="auto"><b>{e.term}</b></div>
          <div class="glossary-cell glossary-cell-arrow" aria-hidden="true">→</div>
          <div class="glossary-cell glossary-cell-translation" dir="auto">{e.translation}</div>
          <div class="glossary-cell glossary-cell-scope">
            <span>{scopeLabel(e.sourceLang)}</span>
            <span aria-hidden="true">→</span>
            <span>{scopeLabel(e.targetLang)}</span>
          </div>
          <div class="glossary-cell glossary-cell-flags">
            {#if e.caseSensitive}<span class="badge">Match case</span>{/if}
          </div>
          <div class="glossary-cell glossary-cell-actions">
            <IconButton
              icon={Pencil}
              ariaLabel="Edit entry {e.term}"
              tooltip="Edit"
              size="sm"
              onclick={() => void startEdit(e)}
            />
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

<SectionCard
  title="Backup & restore"
  description="Share your glossary as a file. Import adds only the terms you do not have yet."
>
  <BackupRestoreRow onExport={doExport} onImport={doImport} status={shareStatus} scope="glossary" />
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
  .glossary-row.is-editing {
    border-color: var(--color-accent);
  }
  .glossary-cell-actions {
    display: inline-flex;
    gap: 2px;
  }
  .glossary-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
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
