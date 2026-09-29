<script lang="ts">
  import type { Settings } from '@/shared/types';
  import type { Task, Tone } from '@/shared/task-prompts';
  import {
    ALL_TASKS,
    ALL_TONES,
    TASK_LABELS,
    TASK_DESCRIPTIONS,
    TONE_LABELS,
    buildTaskTemplate,
  } from '@/shared/task-prompts';
  import { DEFAULT_TEMPLATE } from '@/shared/prompts';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import type TemplateEditorComp from '@/options/components/TemplateEditor.svelte';
  import type { WorkbenchChip } from '@/options/components/AdvancedTemplatesPane.svelte';
  import type { TemplatesHandlers } from '@/options/templates-handlers';

  type TaskChip = 'global' | Task;

  interface Props {
    s: Settings;
    chip: TaskChip;
    backendIds: readonly string[];
    TemplateEditorCmp: typeof TemplateEditorComp | null;
    /** Storage-write handlers, passed whole from the parent tab. */
    handlers: TemplatesHandlers;
    onChipChange: (c: WorkbenchChip) => void;
    onOpenPreview: () => void;
  }

  const { s, chip, backendIds, TemplateEditorCmp, handlers, onChipChange, onOpenPreview }: Props =
    $props();
  // Drafts hold the number boxes while typing, so a settings echo cannot repaint a half-typed value.
  let tempDraft = $state<string | null>(null);
  let maxTokDraft = $state<string | null>(null);

  const isTranslateLikeChip = $derived(chip === 'translate' || chip === 'explain');
  const customSlotNames = $derived(Object.keys(s.advanced.customSlotDescriptions ?? {}));
</script>

{#if chip === 'global' || (ALL_TASKS as readonly string[]).includes(chip)}
  {@const isGlobal = chip === 'global'}
  {@const taskKey = (isGlobal ? 'translate' : (chip as Task)) as Task}
  {@const scopedRules = s.advanced.rules.filter((r) =>
    isGlobal
      ? r.scope.tasks.length === 0
      : r.scope.tasks.length === 0 || r.scope.tasks.includes(taskKey),
  )}

  <p class="chip-desc">
    {isGlobal
      ? 'System + user templates for the Translate (and Explain) pipeline, with per-language presets on top. Summarize, Reword, Grammar, Reply ideas and Ask use their own per-task templates — edit those under their chips.'
      : TASK_DESCRIPTIONS[taskKey]}
  </p>

  {#if scopedRules.length > 0}
    <SectionCard
      title={`Active rules (${scopedRules.length})`}
      description="Click the Rules chip in the strip to manage them."
    >
      <ul class="rules-readonly" data-ega-active-rules-readonly>
        {#each scopedRules.slice(0, 8) as r (r.id)}
          <li>
            <span class="cat cat-{r.category}">{r.category}</span>
            <span class="rule-body">{r.body}</span>
          </li>
        {/each}
        {#if scopedRules.length > 8}
          <li class="more">+ {scopedRules.length - 8} more</li>
        {/if}
      </ul>
      <div class="manage-row">
        <button
          type="button"
          class="link-btn"
          onclick={() => onChipChange('rules')}
          data-ega-manage-rules
        >
          Manage rules ↗
        </button>
      </div>
    </SectionCard>
  {/if}

  {#if !isGlobal}
    {@const tempOverride = s.taskTemperatures?.[taskKey] != null}
    {@const maxTokOverride = s.taskMaxTokens?.[taskKey] != null}
    <SectionCard
      title="Per-task overrides"
      description={`Override the backend, temperature and max tokens for ${TASK_LABELS[taskKey]} only. Leave a field blank to use the global setting.`}
    >
      <div class="param-row" data-ega-task-params={taskKey}>
        <label class="param">
          <span class="lbl">Backend</span>
          <Select
            value={s.taskBackends?.[taskKey] ?? ''}
            options={[
              { value: '', label: 'Use active' },
              { value: 'auto', label: 'Auto' },
              ...backendIds.map((id) => ({ value: id, label: id })),
            ]}
            size="sm"
            ariaLabel={`Backend override for ${TASK_LABELS[taskKey]}`}
            selectAttrs={{ 'data-ega-task-backend': taskKey }}
            modified={!!s.taskBackends?.[taskKey]}
            onchange={(v) => void handlers.setTaskBackend(taskKey, v)}
          />
        </label>

        <label class="param" class:overridden={tempOverride}>
          <span class="lbl">
            Temperature
            <span class="hint">(global: {s.advanced.temperature.toFixed(2)})</span>
            {#if tempOverride}
              <span class="override-badge" title="Override active">override</span>
            {/if}
          </span>
          <input
            type="number"
            min="0"
            max="2"
            step="0.05"
            value={tempDraft ?? s.taskTemperatures?.[taskKey] ?? ''}
            placeholder="(inherit)"
            data-ega-task-temp={taskKey}
            onblur={() => (tempDraft = null)}
            oninput={(e) => {
              // The draft holds the box while typing; a number input reports "" for a half-typed "0.", so clearing waits for change.
              const raw = (e.currentTarget as HTMLInputElement).value.trim();
              tempDraft = raw;
              const n = Number(raw);
              // Plain decimals only: "0.30" saves, a half-typed "0." or an exotic "1e0" waits for change.
              if (!/^\d+(?:\.\d+)?$/.test(raw) || n < 0 || n > 2) return;
              void handlers.setTaskTemperature(taskKey, n);
            }}
            onchange={(e) => {
              tempDraft = null;
              const raw = (e.currentTarget as HTMLInputElement).value.trim();
              if (raw === '') {
                void handlers.setTaskTemperature(taskKey, null);
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              void handlers.setTaskTemperature(taskKey, Math.max(0, Math.min(2, n)));
            }}
          />
        </label>

        <label class="param" class:overridden={maxTokOverride}>
          <span class="lbl">
            Max tokens
            <span class="hint">(global: {s.advanced.maxTokens})</span>
            {#if maxTokOverride}
              <span class="override-badge" title="Override active">override</span>
            {/if}
          </span>
          <input
            type="number"
            min="16"
            max="8192"
            step="1"
            value={maxTokDraft ?? s.taskMaxTokens?.[taskKey] ?? ''}
            placeholder="(inherit)"
            data-ega-task-max={taskKey}
            onblur={() => (maxTokDraft = null)}
            oninput={(e) => {
              // "1" on the way to "100" must not clamp to 16 and repaint under the caret; clearing and clamping wait for change.
              const raw = (e.currentTarget as HTMLInputElement).value.trim();
              maxTokDraft = raw;
              const n = Number(raw);
              if (raw === '' || !Number.isFinite(n) || String(n) !== raw || n < 16 || n > 8192)
                return;
              void handlers.setTaskMaxTokens(taskKey, Math.floor(n));
            }}
            onchange={(e) => {
              maxTokDraft = null;
              const raw = (e.currentTarget as HTMLInputElement).value.trim();
              if (raw === '') {
                void handlers.setTaskMaxTokens(taskKey, null);
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              void handlers.setTaskMaxTokens(taskKey, Math.max(16, Math.min(8192, Math.floor(n))));
            }}
          />
        </label>

        {#if taskKey === 'reword'}
          <label class="param">
            <span class="lbl">
              Tone
              <span class="hint">(default: {s.defaultTone})</span>
            </span>
            <Select
              value={s.advanced.taskTones?.['reword'] ?? ''}
              options={[
                { value: '', label: '(inherit default)' },
                ...ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] })),
              ]}
              size="sm"
              ariaLabel="Tone override for Reword"
              selectAttrs={{ 'data-ega-task-tone': 'reword' }}
              modified={!!s.advanced.taskTones?.['reword']}
              onchange={(v) => {
                if (v === '') {
                  void handlers.setTaskTone('reword', null);
                  return;
                }
                void handlers.setTaskTone('reword', v as Tone);
              }}
            />
          </label>
        {/if}
      </div>
    </SectionCard>
  {/if}

  {#if isGlobal}
    {#if TemplateEditorCmp}
      {@const TE = TemplateEditorCmp}
      <TE
        scope={{ scope: 'global' }}
        task="translate"
        template={s.advanced.promptTemplate}
        inheritedTemplate={DEFAULT_TEMPLATE}
        snippets={s.advanced.snippets ?? {}}
        settings={s}
        onSave={handlers.saveGlobalTemplate}
        onReset={handlers.resetGlobalTemplate}
        inheritedLabel="Reset to default"
        customSlots={customSlotNames}
        onDefineCustom={handlers.setCustomSlotDescription}
      />
    {:else}
      <p class="lazy-loading">Loading editor…</p>
    {/if}
    <div class="aux-row">
      <button type="button" data-ega-preview-prompt onclick={onOpenPreview}>
        Preview compiled prompt
      </button>
      <span class="version-tag">
        Template version:
        <code data-ega-tpl-version>{s.advanced.templateVersion}</code>
      </span>
    </div>
  {:else if isTranslateLikeChip}
    <SectionCard title="Template">
      <div
        class="delegation-banner"
        role="note"
        data-ega-delegation-banner
        data-ega-delegation-task={taskKey}
      >
        <div class="delegation-head">
          <span class="delegation-chip">Delegates to Global</span>
          <span class="delegation-target">
            {TASK_LABELS[taskKey]} uses the Global template
          </span>
        </div>
        <p class="delegation-body">
          {taskKey === 'translate'
            ? 'Translate composes from the global Translate template plus per-language presets. Edit the Global template to change what Translate sends.'
            : 'Explain uses the global Translate template with explain mode on. Edit Global to change what Explain sends.'}
          Per-task rules added from this chip still scope to {TASK_LABELS[taskKey]} only.
        </p>
        <div class="delegation-actions">
          <button
            type="button"
            class="delegation-jump"
            data-ega-delegation-jump
            onclick={() => onChipChange('global')}
          >
            Edit Global template
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <details class="delegation-preview" data-ega-delegation-preview>
          <summary>Show resolved Global template</summary>
          <div class="delegation-preview-body">
            <div class="delegation-preview-block">
              <span class="delegation-preview-label">System</span>
              <pre>{s.advanced.promptTemplate.system}</pre>
            </div>
            <div class="delegation-preview-block">
              <span class="delegation-preview-label">User</span>
              <pre>{s.advanced.promptTemplate.user}</pre>
            </div>
          </div>
        </details>
      </div>
    </SectionCard>
  {:else}
    <div data-ega-task-tab-wrapper={taskKey}>
      {#if TemplateEditorCmp}
        {@const TE = TemplateEditorCmp}
        <TE
          scope={{ scope: 'task', task: taskKey }}
          task={taskKey}
          template={s.advanced.taskTemplates?.[taskKey] ??
            buildTaskTemplate(taskKey, s.defaultTone)}
          inheritedTemplate={buildTaskTemplate(taskKey, s.defaultTone)}
          snippets={s.advanced.snippets ?? {}}
          settings={s}
          onSave={(tpl) => handlers.setTaskTemplate(taskKey, tpl)}
          onReset={() => handlers.setTaskTemplate(taskKey, null)}
          inheritedLabel="Reset to task default"
          customSlots={customSlotNames}
          onDefineCustom={handlers.setCustomSlotDescription}
        />
      {:else}
        <p class="lazy-loading">Loading editor…</p>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .chip-desc {
    margin: 0;
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
  }
  .lazy-loading {
    margin: 0;
    padding: var(--space-3);
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--color-link, var(--color-accent));
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    font: inherit;
  }
  .delegation-banner {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .delegation-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .delegation-chip {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--color-accent);
    padding: 1px var(--space-1);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
  }
  .delegation-target {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
  }
  .delegation-body {
    margin: 0;
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
  .delegation-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .delegation-jump {
    background: var(--color-accent);
    color: var(--color-on-accent, var(--color-bg));
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .delegation-jump:hover {
    filter: brightness(1.05);
  }
  .delegation-jump:focus-visible {
    outline: 2px solid var(--color-focus, var(--color-accent));
    outline-offset: 2px;
  }
  .delegation-preview {
    border-top: 1px dashed var(--color-border-subtle);
    padding-top: var(--space-2);
  }
  .delegation-preview > summary {
    cursor: pointer;
    font-size: var(--fs-sm);
    color: var(--color-fg-subtle);
  }
  .delegation-preview-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .delegation-preview-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .delegation-preview-label {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-fg-subtle);
    font-weight: 600;
  }
  .delegation-preview-body pre {
    margin: 0;
    padding: var(--space-2);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-fg);
    max-height: 14rem;
    overflow-y: auto;
  }
  .aux-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .version-tag code {
    color: var(--color-fg);
    font-family: var(--font-mono);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: 1px var(--space-1);
  }
  .param-row {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }
  .param {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    min-width: 0;
  }
  .param .lbl {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-1);
  }
  .param .lbl .hint {
    color: var(--color-muted);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .param .override-badge {
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    font-size: var(--fs-xs);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }
  .param.overridden input,
  .param.overridden :global(.ega-select) {
    border-color: var(--color-accent);
  }
  .param input,
  .param :global(.ega-select) {
    min-width: 0;
    width: 100%;
  }
  .param :global(.ega-select-wrap) {
    width: 100%;
  }
  .rules-readonly {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .rules-readonly li {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    line-height: var(--lh-body);
  }
  .rules-readonly .cat {
    flex: 0 0 auto;
    padding: 1px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: lowercase;
  }
  .rules-readonly .cat-always {
    color: var(--color-success, var(--color-accent));
  }
  .rules-readonly .cat-never {
    color: var(--color-danger);
  }
  .rules-readonly .rule-body {
    min-width: 0;
    word-break: break-word;
  }
  .rules-readonly .more {
    color: var(--color-fg-subtle);
    font-style: italic;
  }
  .manage-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-2);
  }
</style>
