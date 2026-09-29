<script lang="ts">
  import { onMount } from 'svelte';
  import type { Settings, Variety } from '@/shared/types';
  import { TASK_LABELS, type Task } from '@/shared/task-prompts';
  import { listVarieties } from '@/shared/varieties';
  import type TemplateEditorComp from '@/options/components/TemplateEditor.svelte';
  import type { TemplatesHandlers } from '@/options/templates-handlers';

  interface Props {
    s: Settings;
    TemplateEditorCmp: typeof TemplateEditorComp | null;
    /** Set when CascadeRail jumps here from a task chip — surfaces the
     *  originating task so the user retains the "I was editing X" context. */
    sourceTaskHint?: Task | null;
    /** Storage-write handlers, passed whole from the parent tab. */
    handlers: TemplatesHandlers;
  }

  const { s, TemplateEditorCmp, sourceTaskHint = null, handlers }: Props = $props();

  let varieties = $state<Variety[]>([]);
  let editingPresetId = $state('');
  const existingOverrides = $derived(Object.keys(s.advanced.perPresetTemplates ?? {}).length);

  const builtins = $derived(
    varieties.filter((v) => v.kind === 'builtin').sort((a, b) => a.label.localeCompare(b.label)),
  );
  const customs = $derived(
    varieties.filter((v) => v.kind === 'custom').sort((a, b) => a.label.localeCompare(b.label)),
  );

  onMount(() => {
    void listVarieties({ enabledOnly: false }).then((vs) => {
      varieties = vs;
    });
  });
</script>

<p class="chip-desc">
  Use a different prompt template for one source language. Ega uses it whenever that language is
  detected or selected. Per-language overrides apply to Translate and Explain only.
</p>
{#if sourceTaskHint}
  <p class="source-hint" data-ega-source-task-hint={sourceTaskHint}>
    Came from <strong>{TASK_LABELS[sourceTaskHint]}</strong> — per-language overrides apply to
    Translate and Explain only. Use the chip strip above to go back to
    {TASK_LABELS[sourceTaskHint]}.
  </p>
{/if}
<label class="preset-picker">
  Language
  <select bind:value={editingPresetId}>
    <option value="">(pick a language to add or edit…)</option>
    {#each builtins as p (p.id)}
      <option value={p.id}>
        {p.label}
        {Object.hasOwn(s.advanced.perPresetTemplates, p.id) ? ' • override set' : ''}
      </option>
    {/each}
    {#if customs.length > 0}
      <optgroup label="Custom">
        {#each customs as p (p.id)}
          <option value={p.id}>
            {p.label} (custom)
            {Object.hasOwn(s.advanced.perPresetTemplates, p.id) ? ' • override set' : ''}
          </option>
        {/each}
      </optgroup>
    {/if}
  </select>
</label>
{#if !editingPresetId}
  <div class="per-preset-empty">
    <p class="per-preset-empty-body">
      {#if existingOverrides === 0}
        No per-language overrides yet. Pick a language above to create one, for example a stricter
        tone for Arabic or a looser one for Elvish.
      {:else}
        {existingOverrides} language{existingOverrides === 1 ? '' : 's'} already overridden. Pick one
        above to edit it, or pick another language to add one.
      {/if}
    </p>
  </div>
{/if}
{#if editingPresetId}
  {@const existing = s.advanced.perPresetTemplates[editingPresetId]}
  {#if TemplateEditorCmp}
    {@const TE = TemplateEditorCmp}
    <TE
      scope={{ scope: 'preset', presetId: editingPresetId }}
      task="translate"
      template={existing ?? s.advanced.promptTemplate}
      inheritedTemplate={s.advanced.promptTemplate}
      snippets={s.advanced.snippets ?? {}}
      settings={s}
      onSave={(tpl) => handlers.savePerPreset(editingPresetId, tpl)}
      onReset={() => handlers.clearPerPreset(editingPresetId)}
      inheritedLabel="Clear language override"
    />
  {:else}
    <p class="lazy-loading">Loading editor…</p>
  {/if}
{/if}

<style>
  .chip-desc {
    margin: 0;
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
  }
  .source-hint {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }
  .source-hint strong {
    font-weight: 600;
    color: var(--color-accent);
  }
  .lazy-loading {
    margin: 0;
    padding: var(--space-3);
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
  }
  .preset-picker {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-fg-subtle);
  }
  .preset-picker select {
    min-width: 16rem;
  }
  .per-preset-empty {
    margin-top: var(--space-2);
    padding: var(--space-3);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }
  .per-preset-empty-body {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-fg);
    line-height: 1.5;
  }
</style>
