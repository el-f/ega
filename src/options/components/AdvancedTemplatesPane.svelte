<script lang="ts" module>
  import type { Task } from '@/shared/task-prompts';

  export type WorkbenchChip = 'global' | Task | 'rules' | 'recipes' | 'per-preset' | 'snippets';
</script>

<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { ALL_TASKS, TASK_LABELS } from '@/shared/task-prompts';
  import { CURRENT_TEMPLATE_VERSION, isPromptTemplateCustomised } from '@/shared/settings-schema';
  import { type Rule } from '@/shared/rules';
  import { type Recipe } from '@/shared/recipes';
  import type { TemplatesHandlers } from '@/options/templates-handlers';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import DescribeYourChange from '@/shared/components/DescribeYourChange.svelte';
  import TemplateVersionBanner from '@/options/components/TemplateVersionBanner.svelte';
  import CascadeRail from '@/options/components/CascadeRail.svelte';
  import type TemplateEditorComp from '@/options/components/TemplateEditor.svelte';
  import type RulesEditorComp from '@/options/components/RulesEditor.svelte';
  import type RecipesGalleryComp from '@/options/components/RecipesGallery.svelte';
  import WorkbenchTaskPanel from '@/options/components/templates-pane/WorkbenchTaskPanel.svelte';
  import WorkbenchPerPresetPanel from '@/options/components/templates-pane/WorkbenchPerPresetPanel.svelte';
  import WorkbenchSnippetsPanel from '@/options/components/templates-pane/WorkbenchSnippetsPanel.svelte';
  import { toastStore } from '@/shared/components/toastStore';
  import { debugCatch } from '@/shared/logger';
  import { estimateRulesBlockBytes, RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';

  interface Props {
    s: Settings;
    chip: WorkbenchChip;
    backendIds: readonly string[];
    TemplateEditorCmp: typeof TemplateEditorComp | null;
    RulesEditorCmp: typeof RulesEditorComp | null;
    RecipesGalleryCmp: typeof RecipesGalleryComp | null;
    /** Storage-write handlers, built once by the parent tab and passed whole. */
    handlers: TemplatesHandlers;
    onChipChange: (c: WorkbenchChip) => void;
    onOpenPreview: () => void;
    onKeepMine: () => Promise<void>;
    onShowDiff: () => void;
    onOverwrite: () => Promise<void>;
    /** Wrapped in the parent to capture the undo snapshot. */
    onApplyRecipeFull: (recipe: Recipe) => Promise<void>;
    onUndoRecipeApply: (recipe: Recipe) => void | Promise<void>;
  }

  const {
    s,
    chip,
    backendIds,
    TemplateEditorCmp,
    RulesEditorCmp,
    RecipesGalleryCmp,
    handlers,
    onChipChange,
    onOpenPreview,
    onKeepMine,
    onShowDiff,
    onOverwrite,
    onApplyRecipeFull,
    onUndoRecipeApply,
  }: Props = $props();

  type StoredRules = Settings['advanced']['rules'];
  const asRules = (stored: StoredRules): Rule[] => stored;

  type HeaderChip = 'global' | Task;
  function isHeaderChip(c: WorkbenchChip): c is HeaderChip {
    return c === 'global' || (ALL_TASKS as readonly string[]).includes(c);
  }
  const showHeaderDescribe = $derived(isHeaderChip(chip));
  const describeTask = $derived<Task | 'global'>(
    isHeaderChip(chip) ? (chip === 'global' ? 'global' : (chip as Task)) : 'global',
  );
  const describeHeaderLabel = $derived(
    chip === 'global' ? 'Refine globally' : `Refine ${TASK_LABELS[chip as Task] ?? chip}`,
  );
  const describeHeaderTarget = $derived(
    chip === 'global' ? 'every task' : (TASK_LABELS[chip as Task] ?? String(chip)),
  );
  const describePlaceholder = $derived(
    chip === 'global'
      ? 'Tell Ega what to do differently…'
      : `Tell ${TASK_LABELS[chip as Task] ?? chip} what to do differently…`,
  );

  function isCustomised(c: WorkbenchChip): boolean {
    if (c === 'global') return isPromptTemplateCustomised(s.advanced.promptTemplate);
    if (c === 'per-preset') {
      return Object.keys(s.advanced.perPresetTemplates ?? {}).length > 0;
    }
    if (c === 'snippets') {
      return Object.keys(s.advanced.snippets ?? {}).length > 0;
    }
    if (c === 'rules') {
      return (s.advanced.rules ?? []).length > 0;
    }
    if (c === 'recipes') {
      return ((s.advanced.userRecipes ?? []) as readonly unknown[]).length > 0;
    }
    // Translate and Explain both resolve the global template, so a stored per-task entry there is never read.
    if (c === 'translate' || c === 'explain') return false;
    return Boolean(s.advanced.taskTemplates?.[c]);
  }

  function chipLabel(c: WorkbenchChip): string {
    if (c === 'global') return 'Global';
    if (c === 'per-preset') return 'Per-language';
    if (c === 'snippets') return 'Snippets';
    if (c === 'rules') return 'Rules';
    if (c === 'recipes') return 'Recipes';
    return TASK_LABELS[c];
  }

  const CHIPS: readonly WorkbenchChip[] = [
    'global',
    ...ALL_TASKS,
    'rules',
    'recipes',
    'per-preset',
    'snippets',
  ];

  const OVERRIDE_CHIPS: ReadonlySet<WorkbenchChip> = new Set([
    'rules',
    'recipes',
    'per-preset',
    'snippets',
  ]);
  function chipGroupLabel(c: WorkbenchChip): string {
    return OVERRIDE_CHIPS.has(c) ? 'Overrides' : 'Scope';
  }

  // Site- and task-scoped rules only render for their own host/task, so the warning tracks the biggest single request.
  const rulesBlockBytes = $derived.by(() => {
    const rules = asRules(s.advanced.rules);
    const hosts = [undefined, ...new Set(rules.flatMap((r) => r.scope.sites ?? []))];
    let max = 0;
    for (const task of ALL_TASKS) {
      for (const host of hosts) max = Math.max(max, estimateRulesBlockBytes(rules, task, host));
    }
    return max;
  });
  const rulesBlockOverBudget = $derived(rulesBlockBytes > RULES_BLOCK_WARN_BYTES);

  // Carries the originating task into the per-preset panel; picking a chip directly clears it.
  let sourceTaskHint = $state<Task | null>(null);

  function handleChipChange(c: WorkbenchChip): void {
    sourceTaskHint = null;
    onChipChange(c);
  }

  function handleJumpToLayer(
    layer: 'global' | 'per-task' | 'per-preset',
    fromChip: 'global' | Task,
  ): void {
    const carryTask: Task | null =
      fromChip !== 'global' && layer === 'per-preset' ? (fromChip as Task) : null;
    sourceTaskHint = carryTask;
    if (layer === 'global') onChipChange('global');
    else if (layer === 'per-preset') onChipChange('per-preset');
  }

  function handleChipKey(e: KeyboardEvent, c: WorkbenchChip): void {
    const idx = CHIPS.indexOf(c);
    if (idx === -1) return;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % CHIPS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + CHIPS.length) % CHIPS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = CHIPS.length - 1;
    else return;
    e.preventDefault();
    const target = CHIPS[next];
    if (!target) return;
    // Routing through handleChipChange clears sourceTaskHint, so arrow keys never leave a stale "came from" banner.
    handleChipChange(target);
    document.getElementById(`adv-chip-${target}`)?.focus();
  }

  async function clearCache(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({ kind: 'cache:clear' });
      toastStore.push({ message: 'Translation cache cleared.', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'options.AdvancedTemplatesPane.clearCache');
      toastStore.push({ message: 'Could not clear cache.', variant: 'danger' });
    }
  }
</script>

{#if chip === 'global' && isCustomised('global')}
  <TemplateVersionBanner
    userVersion={s.advanced.templateVersion}
    currentVersion={CURRENT_TEMPLATE_VERSION}
    acknowledgedVersion={s.advanced.templateVersionAcknowledged}
    {onKeepMine}
    {onShowDiff}
    {onOverwrite}
  />
{/if}

<SectionCard title="Prompt workbench">
  <div class="prompt-workbench" data-ega-prompt-workbench>
    <div class="chip-strip" role="tablist" aria-label="Template scope">
      <span class="chip-group-label" aria-hidden="true">Scope</span>
      {#each CHIPS as c (c)}
        {@const isActive = c === chip}
        {@const customised = isCustomised(c)}
        {#if c === 'rules'}
          <span class="chip-divider" aria-hidden="true"></span>
          <span class="chip-group-label" aria-hidden="true">Overrides</span>
        {/if}
        <button
          type="button"
          role="tab"
          id={`adv-chip-${c}`}
          aria-selected={isActive}
          aria-label={`${chipLabel(c)} — ${chipGroupLabel(c)}${customised ? ', customized' : ''}`}
          aria-controls="adv-chip-panel"
          tabindex={isActive ? 0 : -1}
          class="chip"
          class:active={isActive}
          class:customised
          data-ega-task-tab={c === 'global' || c === 'per-preset' || c === 'snippets'
            ? undefined
            : c}
          data-ega-workbench-chip={c}
          onclick={() => handleChipChange(c)}
          onkeydown={(e) => handleChipKey(e, c)}
        >
          {chipLabel(c)}
          {#if customised}
            <span class="custom-dot" aria-hidden="true" title="Custom override saved"></span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="toolbar-row">
      <span class="toolbar-hint" id="ega-clear-cache-hint">
        New translations use your latest templates. Clear the cache to redo older ones.
      </span>
      <button
        type="button"
        class="toolbar-btn"
        data-ega-clear-cache
        aria-describedby="ega-clear-cache-hint"
        onclick={() => void clearCache()}
      >
        Clear translation cache
      </button>
    </div>

    {#if showHeaderDescribe}
      <details class="describe-row" data-ega-describe-header data-ega-describe-scope={chip}>
        <summary class="describe-row-summary">
          <span class="describe-row-label">Refine</span>
          <span class="describe-row-target" class:is-task-key={chip !== 'global'}
            >{describeHeaderTarget}</span
          >
          <span class="describe-row-hint">{describeHeaderLabel}</span>
        </summary>
        <div class="describe-row-body">
          <DescribeYourChange
            task={describeTask}
            onRuleAdded={handlers.appendHeaderRule}
            placeholder={describePlaceholder}
          />
        </div>
      </details>
    {/if}

    {#if chip === 'global' || (ALL_TASKS as readonly string[]).includes(chip)}
      <CascadeRail {s} chip={chip as 'global' | Task} onJumpToLayer={handleJumpToLayer} />
    {/if}

    <div
      class="workbench-body"
      id="adv-chip-panel"
      role="tabpanel"
      aria-labelledby={`adv-chip-${chip}`}
    >
      {#if chip === 'global' || (ALL_TASKS as readonly string[]).includes(chip)}
        <WorkbenchTaskPanel
          {s}
          chip={chip as 'global' | Task}
          {backendIds}
          {TemplateEditorCmp}
          {handlers}
          {onChipChange}
          {onOpenPreview}
        />
      {:else if chip === 'rules'}
        {#if rulesBlockOverBudget}
          <div class="rules-budget-warn" role="alert" data-ega-rules-budget-warn>
            Your rules are over the {RULES_BLOCK_WARN_BYTES / 1024} KB limit, so Ega drops the least specific
            ones from each request.
          </div>
        {/if}
        <SectionCard
          title="Rules"
          description="What Ega does differently — type below or pick a recipe."
        >
          {#if RulesEditorCmp}
            {@const RE = RulesEditorCmp}
            <RE
              rules={asRules(s.advanced.rules)}
              onUpdate={handlers.updateRules}
              onJumpToRecipes={() => onChipChange('recipes')}
            />
          {:else}
            <LoadingState rows={4} label="Loading rules editor…" />
          {/if}
        </SectionCard>
      {:else if chip === 'recipes'}
        <SectionCard
          title="Recipes"
          description="Ready-made starting points: a template, rules and generation settings."
        >
          {#if RecipesGalleryCmp}
            {@const RG = RecipesGalleryCmp}
            <RG
              userRecipes={(s.advanced.userRecipes ?? []) as Recipe[]}
              onApplyFull={onApplyRecipeFull}
              onUndoApply={onUndoRecipeApply}
              onApplyRulesOnly={handlers.applyRecipeRulesOnly}
              onSaveCurrentAs={handlers.saveRecipeFromCurrent}
              onDeleteUserRecipe={handlers.deleteUserRecipe}
              onImport={handlers.importRecipe}
            />
          {:else}
            <LoadingState rows={4} label="Loading recipes…" />
          {/if}
        </SectionCard>
      {:else if chip === 'per-preset'}
        <WorkbenchPerPresetPanel {s} {TemplateEditorCmp} {sourceTaskHint} {handlers} />
      {:else if chip === 'snippets'}
        <WorkbenchSnippetsPanel {s} {handlers} />
      {/if}
    </div>
  </div>
</SectionCard>

<style>
  .prompt-workbench {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .toolbar-hint {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
  }
  .toolbar-btn {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-fg-subtle);
    cursor: pointer;
    font: inherit;
    font-size: var(--fs-xs);
    padding: var(--space-1) var(--space-2);
  }
  .toolbar-btn:hover {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
  }
  .toolbar-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .rules-budget-warn {
    padding: var(--space-2) var(--space-3);
    background: var(
      --color-warning-bg,
      color-mix(in srgb, var(--color-warning-fg, orange) 12%, transparent)
    );
    border: 1px solid var(--color-warning-fg, orange);
    border-radius: var(--radius-md);
    color: var(--color-warning-fg, var(--color-fg));
    font-size: var(--fs-sm);
    line-height: 1.4;
  }
  .describe-row {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .describe-row-summary {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    list-style: none;
    width: 100%;
  }
  .describe-row-summary::-webkit-details-marker {
    display: none;
  }
  .describe-row-label {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--color-accent);
  }
  .describe-row-target {
    font-size: var(--fs-xs);
    color: var(--color-fg);
  }
  /* Mono only for real task-key targets ("Translate", "Explain", …); the
     global chip's "every task" is prose and reads wrong in monospace. */
  .describe-row-target.is-task-key {
    font-family: var(--font-mono);
  }
  .describe-row-hint {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    margin-left: auto;
  }
  .describe-row-body {
    padding: 0 var(--space-3) var(--space-2);
  }
  .chip-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 2px;
    padding: 2px;
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .chip-divider {
    flex: 0 0 1px;
    align-self: stretch;
    background: var(--color-border);
    margin: 2px 4px;
  }
  .chip-group-label {
    align-self: center;
    padding: 0 var(--space-1);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-fg-subtle);
    user-select: none;
  }
  .chip {
    flex: 0 1 auto;
    min-width: max-content;
    padding: var(--space-1) var(--space-2);
    background: transparent;
    color: var(--color-fg-subtle);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    font-family: var(--font-ui);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  .chip:hover:not(.active) {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
  }
  .chip.active {
    background: var(--color-bg);
    color: var(--color-fg);
    border-color: var(--color-border);
    box-shadow: var(--shadow-sm);
  }
  .chip.customised:not(.active) {
    color: var(--color-fg);
  }
  .custom-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    display: inline-block;
  }
  .workbench-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
