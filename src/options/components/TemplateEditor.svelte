<script lang="ts" module>
  import type { Scope } from '@/shared/template-scope.types';
  import type {
    LangPreset,
    PromptTemplate,
    Settings,
    TranslationRequest,
    Variety,
  } from '@/shared/types';
  import type { Task } from '@/shared/task-prompts';
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { type TextareaApi } from './TemplateEditorField.svelte';
  import SlotPalette from './SlotPalette.svelte';
  import TemplateEditorScopeBanner from './TemplateEditorScopeBanner.svelte';
  import TemplateEditorField from './TemplateEditorField.svelte';
  import TemplateEditorActions from './TemplateEditorActions.svelte';
  import TemplateEditorCompiledPreview from './TemplateEditorCompiledPreview.svelte';
  import TemplatePillPreview from './TemplatePillPreview.svelte';
  import { validateAgainstSlots, slotsForTask } from '@/shared/slot-registry';
  import { resolveSnippets } from '@/shared/snippets';
  import { buildPrompt } from '@/shared/prompts';
  import { listVarieties } from '@/shared/varieties';
  import { asLangPresetIdUnsafe } from '@/shared/brands';

  interface Props {
    scope: Scope;
    task: Task;
    template: PromptTemplate;
    inheritedTemplate: PromptTemplate;
    snippets: Record<string, string>;
    settings: Settings;
    onSave: (next: PromptTemplate) => void | Promise<void>;
    onReset: () => void | Promise<void>;
    /** Reset label per scope: 'Reset to default' (global), 'Reset to task default' (task), 'Clear language override' (preset). */
    inheritedLabel?: string;
    /** Names of custom slots that already have a saved description. */
    customSlots?: readonly string[];
    /** Persist a custom slot description. When omitted the Define button is hidden. */
    onDefineCustom?: (name: string, description: string) => void | Promise<void>;
  }

  const {
    scope,
    task,
    template,
    inheritedTemplate,
    snippets,
    settings,
    onSave,
    onReset,
    inheritedLabel = 'Reset to inherited',
    customSlots = [],
    onDefineCustom,
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
  let compiledSys = $state('');
  let compiledUsr = $state('');
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

  function toPreset(v: Variety): LangPreset {
    return {
      id: asLangPresetIdUnsafe(v.id),
      label: v.label,
      hint: v.hint,
      examples: v.examples,
      ...(v.autoDetect ? { autoDetect: v.autoDetect } : {}),
    };
  }

  function compileNow(): void {
    const draft: PromptTemplate = { system: sys, user: usr };
    const presetScope = scope.scope === 'preset' ? scope.presetId : null;
    const scopePreset = presetScope ? varieties.find((v) => v.id === presetScope) : undefined;
    const candidates = presetScope ? undefined : varieties.filter((v) => !v.disabled).map(toPreset);
    const req: TranslationRequest = {
      id: 'preview',
      text: 'Hello world (sample text for preview).',
      sourceLang: presetScope ? asLangPresetIdUnsafe(presetScope) : 'auto',
      targetLang: settings.defaultTargetLang ?? 'en',
      options: {
        stream: false,
        explain: previewExplain,
        task,
        ...(task === 'reword' ? { tone: settings.defaultTone } : {}),
      },
    };
    try {
      const out = buildPrompt(req, {
        preset: scopePreset ? toPreset(scopePreset) : undefined,
        template: draft,
        snippets,
        ...(candidates ? { candidates } : {}),
        ...(task === 'reword' ? { tone: settings.defaultTone } : {}),
      });
      compiledSys = out.system;
      compiledUsr = out.user;
    } catch (err) {
      compiledSys = `// compile error: ${(err as Error).message}`;
      compiledUsr = '';
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
    scheduleCompile();
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

  const previewSys = $derived(resolveSnippets(compiledSys, snippets));
  const previewUsr = $derived(resolveSnippets(compiledUsr, snippets));
</script>

<div class="template-editor" data-ega-template-editor>
  <TemplateEditorScopeBanner {scope} />
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
    {customSlots}
    {onDefineCustom}
  />

  <TemplateEditorField
    id="te-sys"
    labelText="System template"
    value={sys}
    placeholder="System template"
    showReset={sysShowReset}
    {inheritedLabel}
    resetAriaLabel={`Reset system — ${inheritedLabel}`}
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
    {inheritedLabel}
    resetAriaLabel={`Reset user — ${inheritedLabel}`}
    wrapperDataAttr="data-ega-template-user"
    onValueChange={(next) => (usr = next)}
    onFocus={() => (lastFocused = 'usr')}
    onReady={(api) => (usrApi = api)}
    onReset={resetUsrToInherited}
  />

  <TemplateEditorActions
    {dirty}
    {canReset}
    {saveErr}
    saveOk={dirty ? null : saveOk}
    {inheritedLabel}
    onSave={save}
    onReset={reset}
  />

  <TemplatePillPreview {task} system={sys} user={usr} {resolvedValues} />

  <!-- Global scope already has the "Preview compiled prompt" modal — one full-prompt entry point. -->
  {#if scope.scope !== 'global'}
    <TemplateEditorCompiledPreview
      {task}
      {previewSys}
      {previewUsr}
      {previewExplain}
      onPreviewExplainChange={(next) => (previewExplain = next)}
    />
  {/if}
</div>

<style>
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
