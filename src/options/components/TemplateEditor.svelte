<script lang="ts" module>
  import type { PromptTemplate, Settings, Variety } from '@/shared/types';
  import type { Task } from '@/shared/task-prompts';

  /** Which prompt is open: the Translate prompt, a task's own prompt, or one language's prompt. */
  export type Scope =
    { scope: 'global' } | { scope: 'task'; task: Task } | { scope: 'preset'; presetId: string };
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { type TextareaApi } from './TemplateEditorField.svelte';
  import SlotPalette from './SlotPalette.svelte';
  import TemplateEditorField from './TemplateEditorField.svelte';
  import TemplateEditorActions from './TemplateEditorActions.svelte';
  import TemplateEditorCompiledPreview from './TemplateEditorCompiledPreview.svelte';
  import { isBuiltInSlot, validateAgainstSlots, slotsForTask } from '@/shared/slot-registry';
  import { expandSnippets } from '@/shared/snippets';
  import { TEMPLATE_MAX } from '@/shared/settings-schema';
  import { buildPreviewPrompt } from '@/options/preview-prompt';
  import { listVarieties } from '@/shared/varieties';
  import { asLangPresetIdUnsafe } from '@/shared/brands';

  interface Props {
    scope: Scope;
    task: Task;
    template: PromptTemplate;
    inheritedTemplate: PromptTemplate;
    settings: Settings;
    onSave: (next: PromptTemplate) => void | Promise<void>;
    onReset: () => void | Promise<void>;
    /** Reset label: 'Use built-in' for the Translate and task prompts, 'Clear' for a language prompt. */
    inheritedLabel: string;
    /** The per-half reset label, when it differs from the whole-prompt one. */
    fieldResetLabel?: string;
    /** Tells a container that can close the editor whether a draft is unsaved. */
    onDirtyChange?: (dirty: boolean) => void;
  }

  const {
    scope,
    task,
    template,
    inheritedTemplate,
    settings,
    onSave,
    onReset,
    inheritedLabel,
    fieldResetLabel = inheritedLabel,
    onDirtyChange,
  }: Props = $props();

  // ── Editor draft state ────────────────────────────────────────────
  // The effect reads only template.{system,user} and lastKey, so local typing does not re-trigger it.
  let sys = $state(untrack(() => template.system));
  let usr = $state(untrack(() => template.user));
  let lastKey = $state(untrack(() => `${template.system}\x00${template.user}`));
  const dirty = $derived(`${sys}\x00${usr}` !== lastKey);

  $effect(() => {
    const key = `${template.system}\x00${template.user}`;
    if (key === lastKey) return;
    lastKey = key;
    sys = template.system;
    usr = template.user;
  });

  let saveErr: string | null = $state(null);
  let saveOk: string | null = $state(null);

  // ── Compile preview (debounced 200ms) ─────────────────────────────
  let previewSys = $state('');
  let previewUsr = $state('');
  let compileDebounce: number | null = null;
  // Off, the explain slots resolve to empty strings and the preview looks inert.
  let previewExplain = $state(false);

  // Built-in hint overrides and custom languages live outside `settings`, so the preview reads them from storage.
  let varieties = $state<Variety[]>([]);
  onMount(() => {
    void listVarieties({ enabledOnly: false }).then((vs) => {
      varieties = vs;
    });
  });

  function compileNow(): void {
    const draft: PromptTemplate = { system: sys, user: usr };
    const presetScope = scope.scope === 'preset' ? scope.presetId : null;
    try {
      const out = buildPreviewPrompt(settings, {
        task,
        explain: previewExplain,
        template: draft,
        text: 'Hello world (sample text for preview).',
        sourceLang: presetScope ? asLangPresetIdUnsafe(presetScope) : 'auto',
        targetLang: settings.defaultTargetLang ?? 'en',
        varieties,
      });
      previewSys = out.system;
      previewUsr = out.user;
    } catch (err) {
      previewSys = `// compile error: ${(err as Error).message}`;
      previewUsr = '';
    }
  }

  function scheduleCompile(): void {
    if (compileDebounce !== null) clearTimeout(compileDebounce);
    compileDebounce = window.setTimeout(() => {
      compileDebounce = null;
      compileNow();
    }, 200);
  }

  $effect(() => {
    void sys;
    void usr;
    void task;
    void previewExplain;
    void varieties;
    // compileNow runs in a timeout, so the settings and scope it reads are tracked here.
    void settings;
    void scope.scope;
    if (scope.scope === 'preset') void scope.presetId;
    scheduleCompile();
  });

  $effect(() => {
    onDirtyChange?.(dirty);
  });

  onDestroy(() => {
    if (compileDebounce !== null) clearTimeout(compileDebounce);
  });

  // ── Insert-at-cursor wiring (palette → last-focused editor) ───────
  // Defaults to the user field — the required slot lives there.
  let lastFocused: 'sys' | 'usr' = $state('usr');
  let sysApi: TextareaApi | null = $state(null);
  let usrApi: TextareaApi | null = $state(null);

  function insertSlotToken(token: string): void {
    const target = lastFocused === 'sys' ? sysApi : usrApi;
    target?.insertAtCursor(token);
  }

  // ── Resolved-value preview for SlotPalette tooltips ───────────────
  const resolvedValues = $derived.by((): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const s of slotsForTask(task)) {
      out[s.name] = s.example;
    }
    out['langLabel'] ??= 'Arabizi';
    out['targetLangLabel'] ??= settings.defaultTargetLang ?? 'en';
    return out;
  });

  // ── Actions ───────────────────────────────────────────────────────
  async function save(): Promise<void> {
    saveErr = null;
    saveOk = null;
    const next: PromptTemplate = { system: sys, user: usr };
    const v = validateAgainstSlots(next, task);
    if (!v.ok) {
      saveErr = v.errors[0]?.message ?? 'invalid template';
      return;
    }
    await onSave(next);
    lastKey = `${sys}\x00${usr}`;
    saveOk = 'Saved';
  }

  async function reset(): Promise<void> {
    saveErr = null;
    saveOk = null;
    // Pre-seed the draft so the textarea reverts at once; the $effect alone leaves the stale edits on screen.
    sys = inheritedTemplate.system;
    usr = inheritedTemplate.user;
    await onReset();
    lastKey = `${sys}\x00${usr}`;
    saveOk = inheritedLabel;
  }

  // ── Per-field reset — auto-persists ───────────────────────────────
  // Compared against the SAVED template, not the inherited one, so the reset stays visible while the field is dirty.
  const sysDiffersFromSaved = $derived(sys !== template.system);
  const usrDiffersFromSaved = $derived(usr !== template.user);
  const sysDiffersFromInherited = $derived(template.system !== inheritedTemplate.system);
  const usrDiffersFromInherited = $derived(template.user !== inheritedTemplate.user);
  const sysShowReset = $derived(sysDiffersFromSaved || sysDiffersFromInherited);
  const usrShowReset = $derived(usrDiffersFromSaved || usrDiffersFromInherited);

  async function resetSysToInherited(): Promise<void> {
    sys = inheritedTemplate.system;
    await onSave({ system: inheritedTemplate.system, user: usr });
  }
  async function resetUsrToInherited(): Promise<void> {
    usr = inheritedTemplate.user;
    await onSave({ system: sys, user: inheritedTemplate.user });
  }

  const canReset = $derived(sys !== inheritedTemplate.system || usr !== inheritedTemplate.user);
  // Snippets stay stored only while a prompt would pass TEMPLATE_MAX with them written out; flag that prompt.
  const blocksSnippetWriteOut = $derived.by(() => {
    const kept = settings.advanced.snippets;
    if (Object.keys(kept).length === 0) return false;
    return [sys, usr].some((t) => expandSnippets(t, kept).length > TEMPLATE_MAX);
  });
  // Only unknown names: the global and language templates also serve Explain, so a built-in outside `task` can still be filled.
  const unknownSlots = $derived(
    validateAgainstSlots({ system: sys, user: usr }, task).warnings.filter(
      (w) => w.slot !== undefined && !isBuiltInSlot(w.slot),
    ),
  );
</script>

<div class="template-editor" data-ega-template-editor>
  {#if blocksSnippetWriteOut}
    <p class="editor-warn" role="status" data-ega-snippet-warn>
      With its snippets written out, this prompt is longer than {TEMPLATE_MAX.toLocaleString(
        'en-US',
      )}
      characters. Ega keeps using the snippets until you shorten it.
    </p>
  {/if}
  {#if dirty}
    <header class="header-row">
      <span class="dirty-badge" aria-live="polite">Unsaved</span>
    </header>
  {/if}

  <SlotPalette
    {task}
    allTaskSlots={scope.scope === 'global'}
    template={{ system: sys, user: usr }}
    {resolvedValues}
    onInsert={insertSlotToken}
  />

  <TemplateEditorField
    id="te-sys"
    labelText="System template"
    value={sys}
    placeholder="System template"
    showReset={sysShowReset}
    inheritedLabel={fieldResetLabel}
    resetAriaLabel={`Reset system — ${fieldResetLabel}`}
    wrapperDataAttr="data-ega-template-system"
    onValueChange={(next) => (sys = next)}
    onFocus={() => (lastFocused = 'sys')}
    onReady={(api) => (sysApi = api)}
    onReset={resetSysToInherited}
  />

  <TemplateEditorField
    id="te-usr"
    labelText="User template"
    value={usr}
    placeholder="User template"
    showReset={usrShowReset}
    inheritedLabel={fieldResetLabel}
    resetAriaLabel={`Reset user — ${fieldResetLabel}`}
    wrapperDataAttr="data-ega-template-user"
    onValueChange={(next) => (usr = next)}
    onFocus={() => (lastFocused = 'usr')}
    onReady={(api) => (usrApi = api)}
    onReset={resetUsrToInherited}
  />

  {#each unknownSlots as w (w.message)}
    <p class="editor-warn" data-ega-slot-warn>{w.message}. It will be empty.</p>
  {/each}

  <TemplateEditorActions
    {dirty}
    {canReset}
    {saveErr}
    saveOk={dirty ? null : saveOk}
    {inheritedLabel}
    onSave={save}
    onReset={reset}
  />

  <TemplateEditorCompiledPreview
    {task}
    {previewSys}
    {previewUsr}
    {previewExplain}
    onPreviewExplainChange={(next) => (previewExplain = next)}
  />
</div>

<style>
  .editor-warn {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-warning-fg);
    border-radius: var(--radius-md);
    color: var(--color-warning-fg);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }
  .template-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .header-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .dirty-badge {
    font-size: var(--fs-xs);
    color: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-pill);
    padding: 1px var(--space-2);
    background: transparent;
  }
</style>
