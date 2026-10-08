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
  import Disclosure from '@/options/components/Disclosure.svelte';
  import RulesEditor from '@/options/components/RulesEditor.svelte';
  import { createTemplatesHandlers } from '@/options/templates-handlers';
  import { liveCustomTasks } from '@/options/custom-tasks-state.svelte';
  import TaskUsageRow from '@/options/components/TaskUsageRow.svelte';
  import { materializeTasks } from '@/shared/task-view';
  import type { Settings, LangSelection, Variety } from '@/shared/types';
  import BookText from '@lucide/svelte/icons/book-text';

  interface Props {
    s?: Settings | null;
    onSetSettings?: (next: Settings) => void;
  }

  const { s = null, onSetSettings = () => {} }: Props = $props();

  type GlossaryEntry = Settings['glossary'][number];
  interface Fields {
    term: string;
    translation: string;
    sourceLang: string;
    targetLang: string;
    caseSensitive: boolean;
  }
  const EMPTY_FIELDS: Fields = {
    term: '',
    translation: '',
    sourceLang: '',
    targetLang: '',
    caseSensitive: false,
  };

  let entries: GlossaryEntry[] = $state([]);
  let draft: Fields = $state({ ...EMPTY_FIELDS });
  let termError = $state<string | null>(null);
  let translationError = $state<string | null>(null);
  let addError = $state<string | null>(null);
  /** The entry the open row edits, by value: a write finds it in the stored list, where another surface can move it. */
  let editing: GlossaryEntry | null = $state(null);
  /** The open row, by position in the shown list: a saved field replaces the entry object, and the row must stay open with focus where it is. */
  let openIndex = $state<number | null>(null);
  let rowDraft: Fields = $state({ ...EMPTY_FIELDS });
  let rowError = $state<string | null>(null);
  let rowSaved = $state(false);
  let addEl = $state<HTMLDivElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);
  let query = $state('');
  let varieties: Variety[] = $state([]);

  const custom = liveCustomTasks();
  const views = $derived(s ? materializeTasks(s, custom.rows) : []);
  const usedBy = $derived(views.filter((v) => v.glossary && !v.disabled).map((v) => v.label));
  const handlers = createTemplatesHandlers({
    getSettings: () => s,
    setSettings: (next) => onSetSettings(next),
  });

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

  function scopeLabel(id: string | undefined): string {
    if (!id) return 'Any';
    if (id === 'auto') return 'Auto-detect';
    return (
      varieties.find((v) => v.id === id)?.label ??
      ISO_LANGUAGES.find((l) => l.code === id)?.label ??
      id
    );
  }

  // While the default source is Auto-detect, an entry scoped to one source language never matches on its own.
  function sourceNote(sourceLang: string): string | null {
    if (sourceLang === '' || sourceLang === 'auto' || s?.defaultLang !== 'auto') return null;
    return `Applies only when you pick ${scopeLabel(sourceLang)} as the source`;
  }

  const atCap = $derived(entries.length >= GLOSSARY_MAX);
  const CAP_MESSAGE = `The glossary holds ${GLOSSARY_MAX} entries, the most Ega keeps`;

  const writeLock = makeAsyncLock();

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return entries;
    return entries.filter(
      (e) => e.term.toLowerCase().includes(q) || e.translation.toLowerCase().includes(q),
    );
  });

  async function refresh(): Promise<void> {
    const cur = await getSettings();
    entries = [...cur.glossary];
  }

  onMount(() => {
    void refresh();
    void listVarieties().then((vs) => (varieties = vs));
  });

  function langSelection(raw: string): LangSelection | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    // Schema brands at parse; runtime carrier is opaque so the unsafe brand is fine here.
    return asLangIdUnsafe(trimmed);
  }

  function toEntry(f: Fields): GlossaryEntry {
    const sourceLang = langSelection(f.sourceLang);
    const targetLang = langSelection(f.targetLang);
    return {
      term: f.term.trim(),
      translation: f.translation.trim(),
      caseSensitive: f.caseSensitive,
      ...(sourceLang !== undefined ? { sourceLang } : {}),
      ...(targetLang !== undefined ? { targetLang } : {}),
    };
  }

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

  const duplicateMessage = (term: string): string =>
    `${term} is already in the glossary for this scope`;

  async function addEntry(): Promise<void> {
    if (atCap) return;
    addError = null;
    const entry = toEntry(draft);
    termError = entry.term === '' ? 'Write a term' : null;
    translationError = entry.translation === '' ? 'Write a translation' : null;
    if (termError || translationError) {
      await tick();
      addEl?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const result = await writeLock(() =>
      writeGlossary((cur) => {
        if (cur.length >= GLOSSARY_MAX) return 'full';
        return cur.some((g) => isDuplicate(g, entry)) ? 'duplicate' : [...cur, entry];
      }),
    );
    if (result === 'full') addError = CAP_MESSAGE;
    if (result === 'duplicate') addError = duplicateMessage(entry.term);
    if (result !== 'saved') return;
    draft = { ...EMPTY_FIELDS };
    await tick();
    addEl?.querySelector<HTMLInputElement>('input')?.focus();
  }

  function editButton(index: number): HTMLElement | null {
    return listEl?.querySelectorAll<HTMLElement>('[data-ega-glossary-edit]')[index] ?? null;
  }

  function closeRow(): void {
    openIndex = null;
    editing = null;
  }

  async function toggleRow(entry: GlossaryEntry, index: number): Promise<void> {
    rowError = null;
    rowSaved = false;
    if (openIndex === index) {
      closeRow();
      await tick();
      editButton(index)?.focus();
      return;
    }
    openIndex = index;
    editing = entry;
    rowDraft = {
      term: entry.term,
      translation: entry.translation,
      sourceLang: entry.sourceLang ?? '',
      targetLang: entry.targetLang ?? '',
      caseSensitive: entry.caseSensitive,
    };
    await tick();
    listEl?.querySelector<HTMLInputElement>('[data-ega-glossary-editor] input')?.focus();
  }

  // Each field writes when it is left, so the open row replaces the stored entry it was opened on.
  async function saveRow(): Promise<void> {
    const original = editing;
    if (!original) return;
    const entry = toEntry(rowDraft);
    if (entry.term === '' || entry.translation === '') {
      rowError = entry.term === '' ? 'Write a term' : 'Write a translation';
      return;
    }
    rowError = null;
    if (sameEntry(original, entry)) return;
    const result = await writeLock(() =>
      writeGlossary((cur) => {
        const at = cur.findIndex((g) => sameEntry(g, original));
        if (at < 0) return 'unchanged';
        // A near-duplicate the original already had (cs "Apple" beside ci "apple") must not block editing it.
        if (cur.some((g, i) => i !== at && isDuplicate(g, entry) && !isDuplicate(g, original)))
          return 'duplicate';
        return cur.map((g, i) => (i === at ? entry : g));
      }),
    );
    if (result === 'duplicate') rowError = duplicateMessage(entry.term);
    if (result === 'unchanged') {
      rowError = 'This entry changed in another window. Close it, then edit it again.';
    }
    if (result !== 'saved') return;
    editing = entry;
    rowSaved = true;
  }

  async function onRowKeydown(e: KeyboardEvent, index: number): Promise<void> {
    if (e.key !== 'Escape' || e.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    // Closing removes the focused field before its blur runs, so the field is written here.
    await saveRow();
    closeRow();
    await tick();
    editButton(index)?.focus();
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
    // Gone either way, unless the write itself failed and a retry is still possible.
    if (result !== 'failed') closeRow();
    await tick();
    // The next row takes focus, else the previous one, else the Add button.
    const edits = listEl?.querySelectorAll<HTMLElement>('[data-ega-glossary-edit]') ?? [];
    (
      edits[Math.min(shownAt, edits.length - 1)] ??
      addEl?.querySelector<HTMLElement>('[data-ega-glossary-add-button]')
    )?.focus();
    if (result !== 'saved') return;
    toastStore.push({
      message: `Deleted "${entry.term}"`,
      variant: 'success',
      action: { label: 'Undo', onClick: () => void restoreEntry(entry, removedAt) },
    });
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
    if (result === 'full') addError = CAP_MESSAGE;
    if (result !== 'saved') return;
    await tick();
    const shown = filtered.findIndex((g) => sameEntry(g, entry));
    if (shown >= 0) editButton(shown)?.focus();
  }

  let shareStatus = $state<ImportStatus | null>(null);

  async function doExport(): Promise<void> {
    shareStatus = null;
    try {
      const bundle = await exportGlossary();
      downloadJsonFile(`ega-glossary-${new Date().toISOString().slice(0, 10)}.json`, bundle);
      shareStatus = {
        kind: 'ok',
        msg: `Exported ${count(bundle.egaGlossary.entries.length, 'entry', 'entries')}`,
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
</script>

{#snippet scopeFields(f: Fields, idPrefix: string, onLeave: (() => void) | null)}
  <div class="gl-scope-row">
    <Select
      id="{idPrefix}-source"
      label="Source language"
      value={f.sourceLang}
      options={sourceOptions}
      onchange={(v) => {
        f.sourceLang = v;
        onLeave?.();
      }}
    />
    <Select
      id="{idPrefix}-target"
      label="Target language"
      value={f.targetLang}
      options={targetOptions}
      onchange={(v) => {
        f.targetLang = v;
        onLeave?.();
      }}
    />
  </div>
  <Checkbox
    id="{idPrefix}-case"
    checked={f.caseSensitive}
    label="Match case"
    onchange={(v) => {
      f.caseSensitive = v;
      onLeave?.();
    }}
  />
  {@const note = sourceNote(f.sourceLang)}
  {#if note}<p class="gl-line" data-ega-glossary-scope-note>{note}</p>{/if}
{/snippet}

<section data-ega-tab="glossary">
  <TabHeader tab="glossary" />

  <SectionCard
    title="Glossary"
    description="Terms Ega always translates the same way"
    info={{
      label: 'About the glossary',
      text: 'An entry is sent only when its term appears in the text. Scope follows the language picked for the request, not the detected one.',
    }}
  >
    {#if s}
      <!-- The same read-only row as "Sent with" on Answers: one pattern, one look. -->
      <div class="gl-used-by" data-ega-glossary-used-by>
        <TaskUsageRow
          label="Used by"
          names={usedBy}
          emptyText="No task uses it yet"
          changeName="Change which tasks use the glossary"
          target="tasks.overrides"
        />
      </div>
    {/if}

    <div class="glossary-add" data-ega-glossary-add bind:this={addEl}>
      <div class="gl-field">
        <Input
          bind:value={draft.term}
          label="Term"
          placeholder="e.g. Firebolt"
          maxlength={GLOSSARY_FIELD_MAX}
          oninput={() => (termError = null)}
          dataAttrs={{
            'aria-invalid': termError ? 'true' : undefined,
            'aria-describedby': termError ? 'gl-term-error' : undefined,
          }}
        />
        {#if termError}<p class="gl-error" id="gl-term-error">{termError}</p>{/if}
      </div>
      <div class="gl-field">
        <Input
          bind:value={draft.translation}
          label="Translation"
          placeholder="e.g. Saeta de Fuego"
          maxlength={GLOSSARY_FIELD_MAX}
          oninput={() => (translationError = null)}
          dataAttrs={{
            'aria-invalid': translationError ? 'true' : undefined,
            'aria-describedby': translationError ? 'gl-translation-error' : undefined,
          }}
        />
        {#if translationError}<p class="gl-error" id="gl-translation-error">
            {translationError}
          </p>{/if}
      </div>
      <div class="gl-add-button">
        <Button
          variant="secondary"
          ariaDisabled={atCap}
          {...atCap ? { describedBy: 'gl-cap' } : {}}
          dataAttrs={{ 'data-ega-glossary-add-button': true }}
          onclick={() => void addEntry()}>Add</Button
        >
      </div>
    </div>
    {#if atCap}<p class="gl-line" id="gl-cap" data-ega-glossary-cap>{CAP_MESSAGE}</p>{/if}
    {#if addError}<p class="gl-error" role="alert">{addError}</p>{/if}
    <Disclosure label="More options" dataAttrs={{ 'data-ega-glossary-more': true }}>
      <div class="gl-more">{@render scopeFields(draft, 'gl-add', null)}</div>
    </Disclosure>

    {#if entries.length === 0}
      <EmptyState
        title="No glossary entries yet"
        description="Add names and terms that must translate the same way every time"
        icon={BookText}
      />
    {:else}
      {#if entries.length > 10}
        <div class="glossary-filter">
          <Input
            bind:value={query}
            oninput={closeRow}
            placeholder="Filter entries"
            ariaLabel="Filter glossary entries"
            size="sm"
            type="search"
          />
        </div>
      {/if}
      <ul class="glossary-list" data-ega-glossary-list bind:this={listEl}>
        <!-- Keyed by position: a saved edit replaces the entry object, and the open row must keep its fields and focus. -->
        {#each filtered as e, i (i)}
          {@const open = openIndex === i}
          <li class="glossary-row" class:is-open={open}>
            <div class="gl-row-line">
              <span class="gl-pair">
                <span class="gl-term" dir="auto">{e.term}</span>
                <span class="gl-arrow" aria-hidden="true">→</span>
                <span dir="auto">{e.translation}</span>
              </span>
              <span class="gl-scope">
                {scopeLabel(e.sourceLang)}<span aria-hidden="true"> → </span><span
                  class="ega-sr-only"
                >
                  to
                </span>{scopeLabel(e.targetLang)}{e.caseSensitive ? ' · Match case' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                ariaLabel={`${open ? 'Close' : 'Edit'} entry ${e.term}`}
                dataAttrs={{
                  'data-ega-glossary-edit': true,
                  'aria-expanded': open ? 'true' : 'false',
                  'aria-controls': open ? `gl-editor-${i}` : undefined,
                }}
                onclick={() => void toggleRow(e, i)}>{open ? 'Close' : 'Edit'}</Button
              >
            </div>
            {#if open}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="gl-editor"
                id="gl-editor-{i}"
                data-ega-glossary-editor
                onkeydown={(ev) => void onRowKeydown(ev, i)}
              >
                <div class="gl-editor-pair">
                  <Input
                    bind:value={rowDraft.term}
                    label="Term"
                    maxlength={GLOSSARY_FIELD_MAX}
                    onblur={() => void saveRow()}
                  />
                  <Input
                    bind:value={rowDraft.translation}
                    label="Translation"
                    maxlength={GLOSSARY_FIELD_MAX}
                    onblur={() => void saveRow()}
                  />
                </div>
                {@render scopeFields(rowDraft, `gl-row-${i}`, () => void saveRow())}
                {#if rowError}<p class="gl-error" role="alert">{rowError}</p>{/if}
                <div class="gl-editor-actions">
                  <Button
                    variant="ghost"
                    iconKind="delete"
                    ariaLabel={`Delete entry ${e.term}`}
                    onclick={() => void removeEntry(e)}>Delete entry</Button
                  >
                  <span class="gl-saved" role="status">{rowSaved ? 'Saved' : ''}</span>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </SectionCard>

  {#if s}
    <RulesEditor rules={s.advanced.rules} onUpdate={handlers.updateRules} taskViews={views} />
  {/if}

  <SectionCard
    title="Backup and restore"
    description="Your glossary as a file"
    info={{
      label: 'About this backup',
      text: 'Import adds only the terms you do not have yet. Rules are in the full backup on the Advanced tab.',
    }}
  >
    <BackupRestoreRow
      onExport={doExport}
      onImport={doImport}
      status={shareStatus}
      scope="glossary"
      exportBlockedReason={entries.length === 0 ? 'Nothing to export yet' : null}
    />
  </SectionCard>
</section>

<style>
  .gl-used-by {
    margin-bottom: var(--space-3);
  }
  .glossary-add {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: var(--space-2);
    align-items: start;
  }
  .gl-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  /* Lines the button up with the inputs under their labels. */
  .gl-add-button {
    align-self: end;
  }
  .glossary-add:has(.gl-error) .gl-add-button {
    align-self: center;
  }
  .gl-more {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-1) var(--space-2);
  }
  .gl-scope-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-2);
  }
  .gl-line,
  .gl-error {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .gl-line {
    color: var(--color-muted);
  }
  .gl-error {
    color: var(--color-danger-fg);
  }
  .glossary-filter {
    margin-block: var(--space-2);
  }
  .glossary-list {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
  }
  .glossary-row {
    padding-block: var(--space-1);
  }
  .glossary-row + .glossary-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .gl-row-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-height: 40px;
  }
  .gl-pair {
    flex: 1 1 14rem;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--fs-base);
  }
  .gl-term {
    font-weight: 600;
  }
  .gl-arrow {
    color: var(--color-muted);
    padding-inline: var(--space-1);
  }
  .gl-scope {
    color: var(--color-muted);
    font-size: var(--fs-base);
  }
  .gl-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-2);
  }
  .gl-editor-pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-2);
  }
  .gl-editor-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .gl-saved {
    font-size: var(--fs-base);
    color: var(--color-success-fg);
  }
  @media (max-width: 560px) {
    .glossary-add {
      grid-template-columns: 1fr;
    }
  }
</style>
