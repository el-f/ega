<script lang="ts">
  import { onMount } from 'svelte';
  import type { Variety, VarietyEdit } from '@/shared/types';
  import {
    listVarieties,
    updateVariety,
    resetVariety,
    addCustomVariety,
    deleteVariety,
  } from '@/shared/varieties';
  import { getSettings, exportVarieties } from '@/shared/storage';
  import { count, importBundleFile, type ImportStatus } from '@/options/import-bundle';
  import { saveSettings } from '@/options/storage-with-toast';
  import { makeAsyncLock } from '@/shared/utils/async-lock';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import { downloadJsonFile } from '@/shared/download-file';
  import TabHeader from '@/shared/components/TabHeader.svelte';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import {
    CUSTOM_LANG_EXAMPLES_MAX,
    VARIETY_EXAMPLE_MAX,
    VARIETY_EXAMPLES_MAX,
    VARIETY_HINT_MAX,
    VARIETY_LABEL_MAX,
  } from '@/shared/settings-schema';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import BackupRestoreRow from '@/options/components/BackupRestoreRow.svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import X from '@lucide/svelte/icons/x';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';

  let all: Variety[] = $state.raw([]);
  let form = $state({ label: '', hint: '' });
  let expanded = $state<string | null>(null);
  let query = $state('');
  // The add form starts hidden, so the page stays short for users who only manage the built-ins.
  let showAddForm = $state(false);
  // Draft holds per-row editable copies. `label` is optional — only customs
  // expose it (built-in label is immutable).
  let draft = $state<
    Record<
      string,
      {
        label?: string;
        hint: string;
        examples: Array<{ src: string; tgt: string }>;
        autoDetect?: { regex: string; flags: string; minScore: number };
      }
    >
  >({});
  let saved = $state<Record<string, boolean>>({});
  let flashId = $state<string | null>(null);

  const sorted = $derived([...all].sort((a, b) => a.label.localeCompare(b.label)));
  const filtered = $derived(
    query.trim() === ''
      ? sorted
      : sorted.filter((v) => v.label.toLowerCase().includes(query.toLowerCase())),
  );

  async function refresh(): Promise<void> {
    all = await listVarieties();
  }

  onMount(() => {
    void refresh();
  });

  // Two fast checkbox flips interleave their read-modify-write, so they queue behind the same tail promise storage uses.
  const toggleDisabledLock = makeAsyncLock();
  async function toggleDisabled(v: Variety): Promise<void> {
    await toggleDisabledLock(async () => {
      const s = await getSettings();
      const cur = s.disabledVarieties;
      const next = cur.includes(v.id) ? cur.filter((id) => id !== v.id) : [...cur, v.id];
      if (await saveSettings({ disabledVarieties: next })) await refresh();
    });
  }

  function startEdit(v: Variety): void {
    if (expanded === v.id) {
      expanded = null;
      return;
    }
    expanded = v.id;
    draft[v.id] = {
      hint: v.hint,
      examples: v.examples.map((e) => ({ ...e })),
      ...(v.autoDetect ? { autoDetect: { ...v.autoDetect } } : {}),
      ...(v.kind === 'custom' ? { label: v.label } : {}),
    };
  }

  async function save(v: Variety): Promise<void> {
    const d = draft[v.id];
    if (!d) return;
    const patch: VarietyEdit = {
      hint: d.hint,
      examples: d.examples.filter((e) => e.src.trim() || e.tgt.trim()),
    };
    if (d.autoDetect?.regex) patch.autoDetect = d.autoDetect;
    if (v.kind === 'custom' && d.label) patch.label = d.label;
    // An unchanged built-in would store an override that only shadows the preset.
    if (v.kind !== 'custom' && sameEdit(patch, v)) {
      saved[v.id] = true;
      setTimeout(() => (saved[v.id] = false), 1500);
      return;
    }
    try {
      await updateVariety(v.id, patch);
    } catch (e) {
      const msg =
        (e as Error).message === 'invalid-language'
          ? `"${v.label}" needs a label and a hint to save.`
          : (e as Error).message === 'nested-quantifier'
            ? `The detection pattern for "${v.label}" nests one repeat inside another, like (a+)+. That can freeze a page, so it was not saved.`
            : `Could not save "${v.label}": ${(e as Error).message}`;
      toastStore.push({ message: msg, variant: 'danger' });
      return;
    }
    await refresh();
    saved[v.id] = true;
    setTimeout(() => (saved[v.id] = false), 1500);
  }

  function sameEdit(patch: VarietyEdit, v: Variety): boolean {
    const current: VarietyEdit = {
      hint: v.hint,
      examples: v.examples.map((e) => ({ src: e.src, tgt: e.tgt })),
      ...(v.autoDetect ? { autoDetect: v.autoDetect } : {}),
    };
    return JSON.stringify(patch) === JSON.stringify(current);
  }

  function rebuildDraft(id: string): void {
    const refreshed = all.find((x) => x.id === id);
    if (!refreshed) return;
    draft[id] = {
      hint: refreshed.hint,
      examples: refreshed.examples.map((e) => ({ ...e })),
      ...(refreshed.autoDetect ? { autoDetect: { ...refreshed.autoDetect } } : {}),
      ...(refreshed.kind === 'custom' ? { label: refreshed.label } : {}),
    };
  }

  async function reset(v: Variety): Promise<void> {
    // Snapshot the saved override so the toast's Undo can put it back.
    const prior: VarietyEdit = {
      hint: v.hint,
      examples: v.examples.map((e) => ({ ...e })),
      ...(v.autoDetect ? { autoDetect: { ...v.autoDetect } } : {}),
    };
    try {
      await resetVariety(v.id);
    } catch (e) {
      toastStore.push({
        message: `Could not reset "${v.label}": ${(e as Error).message}`,
        variant: 'danger',
      });
      return;
    }
    await refresh();
    rebuildDraft(v.id);
    toastStore.push({
      message: `"${v.label}" reset to built-in.`,
      variant: 'success',
      action: {
        label: 'Undo',
        onClick: () => {
          void updateVariety(v.id, prior).then(async () => {
            await refresh();
            rebuildDraft(v.id);
          });
        },
      },
    });
  }

  async function doDelete(v: Variety): Promise<void> {
    const confirmed = await confirmDialog({
      title: 'Delete custom language?',
      body: `This removes "${v.label}" and its examples. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteVariety(v.id);
    } catch (e) {
      toastStore.push({
        message: `Could not delete "${v.label}": ${(e as Error).message}`,
        variant: 'danger',
      });
      return;
    }
    await refresh();
    if (expanded === v.id) expanded = null;
  }

  let addError = $state<string | null>(null);

  async function addCustom(): Promise<void> {
    if (!form.label.trim() || !form.hint.trim()) return;
    addError = null;
    let added: Variety;
    try {
      added = await addCustomVariety({
        label: form.label.trim(),
        hint: form.hint.trim(),
        examples: [],
      });
    } catch (e) {
      if ((e as Error).message === 'cap-reached') {
        addError = 'Custom language limit is 200 — delete one before adding another.';
      } else if ((e as Error).message === 'invalid-language') {
        addError = 'Label and hint are required, and each has a length limit.';
      } else {
        addError = `Could not add the language: ${(e as Error).message}`;
      }
      return;
    }
    form = { label: '', hint: '' };
    showAddForm = false;
    // Clear the filter so the new alphabetically-sorted row is actually in the list.
    query = '';
    await refresh();
    toastStore.push({ message: `Added "${added.label}".`, variant: 'success' });
    flashId = added.id;
    setTimeout(() => (flashId = null), 1200);
    requestAnimationFrame(() => {
      document
        .getElementById(`enable-${added.id}`)
        ?.closest('.variety-row')
        ?.scrollIntoView({ block: 'center' });
    });
  }

  let backupState = $state<ImportStatus | null>(null);

  async function doExportVarieties(): Promise<void> {
    backupState = null;
    try {
      const bundle = await exportVarieties();
      downloadJsonFile(`ega-varieties-${new Date().toISOString().slice(0, 10)}.json`, bundle);
      backupState = {
        kind: 'ok',
        msg: `Exported ${count(bundle.egaVarieties.customLanguages.length, 'custom language')}, ${count(Object.keys(bundle.egaVarieties.varietyOverrides).length, 'override')}.`,
      };
    } catch (e) {
      backupState = { kind: 'err', msg: `Export failed: ${(e as Error).message}` };
    }
  }

  async function doImportVarieties(file: File): Promise<void> {
    backupState = null;
    const status = await importBundleFile(file, 'varieties');
    if (!status) return;
    backupState = status;
    if (status.kind === 'ok') await refresh();
  }

  function exampleCapFor(id: string): number {
    return all.find((v) => v.id === id)?.kind === 'custom'
      ? CUSTOM_LANG_EXAMPLES_MAX
      : VARIETY_EXAMPLES_MAX;
  }

  function addExample(id: string): void {
    const d = draft[id];
    if (!d) return;
    const cap = exampleCapFor(id);
    if (d.examples.length >= cap) {
      toastStore.push({
        message: `Example limit is ${cap} — remove one before adding another.`,
        variant: 'warning',
      });
      return;
    }
    d.examples = [...d.examples, { src: '', tgt: '' }];
  }

  function removeExample(id: string, idx: number): void {
    const d = draft[id];
    if (!d) return;
    d.examples = d.examples.filter((_, i) => i !== idx);
  }
</script>

<TabHeader tab="languages" />

<SectionCard
  title="Backup & restore"
  description="Export your custom languages and built-in overrides as JSON. Import to restore or share."
>
  <BackupRestoreRow
    onExport={doExportVarieties}
    onImport={doImportVarieties}
    status={backupState}
    scope="languages"
  />
</SectionCard>

<SectionCard title="All languages">
  {#snippet headerActions()}
    <IconButton
      icon={showAddForm ? X : Plus}
      ariaLabel={showAddForm ? 'Cancel adding language' : 'Add custom language'}
      tooltip={showAddForm ? 'Cancel' : 'Add custom language'}
      size="sm"
      onclick={() => (showAddForm = !showAddForm)}
    />
  {/snippet}

  {#if showAddForm}
    <div class="add-form">
      <Input label="Label" required maxlength={VARIETY_LABEL_MAX} bind:value={form.label} />
      <label class="field-label" for="new-hint">Hint *</label>
      <textarea
        id="new-hint"
        dir="auto"
        required
        aria-required="true"
        maxlength={VARIETY_HINT_MAX}
        value={form.hint}
        oninput={(e) => (form.hint = (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
      <p class="add-form-help">
        Examples help the most. After you create the language, add 3–5 short pairs of original text
        and its translation.
      </p>
      {#if addError}
        <p class="add-form-error" role="alert">{addError}</p>
      {/if}
      <div class="row">
        <Button
          variant="primary"
          onclick={addCustom}
          disabled={!form.label.trim() || !form.hint.trim()}
          title={!form.label.trim() || !form.hint.trim()
            ? 'Label and hint are required.'
            : undefined}
        >
          Add
        </Button>
        <Button
          variant="secondary"
          onclick={() => {
            showAddForm = false;
            addError = null;
          }}>Cancel</Button
        >
      </div>
    </div>
  {/if}

  <div class="variety-filter" data-ega-variety-filter>
    <Input
      bind:value={query}
      placeholder="Filter languages…"
      ariaLabel="Filter languages"
      size="sm"
    />
  </div>

  {#each filtered as v (v.id)}
    {@const isCustom = v.kind === 'custom'}
    <div class="variety-row" class:expanded={expanded === v.id} class:flash={flashId === v.id}>
      <div class="variety-row-head">
        <Checkbox
          id="enable-{v.id}"
          checked={!v.disabled}
          ariaLabel="Enable {v.label}"
          onchange={() => toggleDisabled(v)}
        />
        <label for="enable-{v.id}" class="variety-label-inline">
          <b>{v.label}</b>
          <span class="badge" class:custom={isCustom}>{isCustom ? 'Custom' : 'Built-in'}</span>
          {#if v.hasOverrides}<span class="badge badge-edited">edited</span>{/if}
        </label>
        <span class="variety-hint" title={v.hint}>{v.hint}</span>
        <span class="variety-count">{v.examples.length} ex</span>
        <div class="variety-actions">
          <IconButton
            icon={expanded === v.id ? X : Pencil}
            ariaLabel={expanded === v.id ? 'Close editor' : 'Edit'}
            tooltip={expanded === v.id ? 'Close' : 'Edit'}
            size="sm"
            onclick={() => startEdit(v)}
          />
          {#if v.kind === 'custom'}
            <IconButton
              icon={Trash2}
              ariaLabel="Delete custom language"
              tooltip="Delete"
              size="sm"
              variant="danger"
              onclick={() => doDelete(v)}
            />
          {/if}
        </div>
      </div>
      <CollapsibleField open={expanded === v.id}>
        {@const d = draft[v.id]}
        {#if d}
          {#if v.kind === 'custom'}
            <label class="field-label" for="lbl-{v.id}">Label</label>
            <input
              id="lbl-{v.id}"
              type="text"
              dir="auto"
              maxlength={VARIETY_LABEL_MAX}
              bind:value={d.label}
            />
          {/if}
          <label class="field-label" for="hint-{v.id}">Hint</label>
          <textarea id="hint-{v.id}" dir="auto" maxlength={VARIETY_HINT_MAX} bind:value={d.hint}
          ></textarea>
          <div class="variety-examples-head">Examples</div>
          {#each d.examples as ex, i (ex)}
            <div class="row variety-example-row">
              <input
                type="text"
                dir="auto"
                placeholder="Original text"
                maxlength={VARIETY_EXAMPLE_MAX}
                bind:value={ex.src}
                aria-label="Example source"
              />
              <input
                type="text"
                dir="auto"
                placeholder="Translation (English)"
                maxlength={VARIETY_EXAMPLE_MAX}
                bind:value={ex.tgt}
                aria-label="Example translation"
              />
              <IconButton
                icon={Trash2}
                ariaLabel="Remove example"
                tooltip="Remove example"
                size="sm"
                variant="danger"
                onclick={() => removeExample(v.id, i)}
              />
            </div>
          {/each}
          <div class="row variety-add-example-row">
            <Button variant="secondary" size="sm" onclick={() => addExample(v.id)}>
              Add another example
            </Button>
          </div>
          <hr class="variety-editor-divider" />
          <div class="row variety-commit-row">
            <Button variant="primary" onclick={() => save(v)}>Save</Button>
            {#if v.hasOverrides}
              <Button
                variant="secondary"
                title="Remove your saved edits and restore the built-in version"
                onclick={(e) => {
                  e.stopPropagation();
                  void reset(v);
                }}
              >
                Reset to built-in
              </Button>
            {/if}
            {#if saved[v.id]}<span class="ok">Saved ✓</span>{/if}
          </div>
        {/if}
      </CollapsibleField>
    </div>
  {:else}
    <p class="variety-empty">
      {#if query.trim() !== ''}
        No languages match "{query}".
      {:else}
        No languages yet.
      {/if}
    </p>
  {/each}
</SectionCard>

<style>
  .variety-filter {
    margin: var(--space-1) 0 var(--space-2);
  }
  /* Copies .ega-input-label from <Input>, which scopes it to its own file, so raw <label>s here match. */
  .field-label {
    display: block;
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-fg);
  }
  .variety-empty {
    margin: var(--space-2) 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  /* Neutral and outlined, so amber stays reserved for the "Custom" badge and the two facts read apart. */
  .badge-edited {
    background: transparent;
    color: var(--color-fg-subtle);
    border: 1px solid var(--color-border);
  }
  /* One flex line; the editor panel drops below it.  */
  .variety-row {
    margin-top: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
  }
  .variety-row.expanded {
    border-color: var(--color-border);
    padding-bottom: var(--space-3);
    background: var(--color-bg-sunken);
  }
  .variety-row.flash {
    animation: variety-flash var(--motion-pulse) var(--ease-out);
  }
  @keyframes variety-flash {
    0% {
      background: var(--color-accent-bg-soft);
    }
    100% {
      background: var(--color-bg-elevated);
    }
  }
  .variety-row-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .variety-label-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    flex: 0 0 auto;
    cursor: pointer;
  }
  .variety-hint {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .variety-count {
    flex: 0 0 auto;
    color: var(--color-muted);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }
  .variety-actions {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .variety-examples-head {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-muted);
    font-weight: 500;
  }
  .variety-example-row :global(input[type='text']) {
    flex: 1;
  }
  .variety-add-example-row {
    margin-top: var(--space-1);
  }
  .variety-editor-divider {
    margin: var(--space-3) 0 var(--space-2);
    border: none;
    border-top: 1px solid var(--color-border-subtle);
  }
  .variety-commit-row {
    gap: var(--space-2);
  }
  /* Overrides the global textarea min-height, so an expanded row stays under one screen. */
  .variety-row :global(textarea) {
    min-height: 56px;
  }
  .add-form :global(textarea) {
    min-height: 56px;
  }
  /* Add-form: tighter vertical rhythm than the global label/help defaults. */
  .add-form label {
    margin: var(--space-2) 0 var(--space-1) 0;
  }
  .add-form-help {
    margin: var(--space-1) 0 var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .add-form-error {
    margin: var(--space-1) 0;
    font-size: var(--fs-sm);
    color: var(--color-danger);
  }
</style>
