<script lang="ts">
  import type { Task } from '@/shared/task-prompts';
  import { ALL_TASKS, TASK_LABELS } from '@/shared/task-prompts';
  import { BUNDLED_RECIPES, serialiseRecipe, type Recipe } from '@/shared/recipes';
  import Button from '@/shared/ui/Button.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import { debugCatch } from '@/shared/logger';
  import RecipeCard from './recipes/RecipeCard.svelte';
  import RecipeApplyConfirmDialog from './recipes/RecipeApplyConfirmDialog.svelte';
  import RecipeNewDialog from './recipes/RecipeNewDialog.svelte';
  import RecipePasteDialog from './recipes/RecipePasteDialog.svelte';

  interface Props {
    userRecipes: readonly Recipe[];
    onApplyFull: (recipe: Recipe) => Promise<void>;
    onApplyRulesOnly: (recipe: Recipe) => Promise<void>;
    onSaveCurrentAs: (label: string, description: string, task: Task) => Promise<void>;
    onDeleteUserRecipe: (id: string) => Promise<void>;
    onImport: (encoded: string) => Promise<void>;
    /** When set, the success toast offers Undo; the parent owns the snapshot. */
    onUndoApply?: (recipe: Recipe) => void | Promise<void>;
  }

  let {
    userRecipes,
    onApplyFull,
    onApplyRulesOnly,
    onSaveCurrentAs,
    onDeleteUserRecipe,
    onImport,
    onUndoApply,
  }: Props = $props();

  type Tab = 'bundled' | 'yours';
  let activeTab = $state<Tab>('bundled');

  // 'all' restores the full per-task grouping; any other value narrows the grid to one task.
  let filterTask = $state<Task | 'all'>('all');

  const groupedBundled = $derived(applyFilter(groupByTask(BUNDLED_RECIPES), filterTask));
  const groupedUser = $derived(applyFilter(groupByTask(userRecipes), filterTask));

  function applyFilter(
    groups: readonly { task: Task; recipes: readonly Recipe[] }[],
    f: Task | 'all',
  ): readonly { task: Task; recipes: readonly Recipe[] }[] {
    if (f === 'all') return groups;
    return groups.filter((g) => g.task === f);
  }

  // Object map (not Set) — svelte/prefer-svelte-reactivity flags raw Set
  // inside reactive scopes, and the membership check here is one-shot.
  const availableFilterTasks = $derived.by<readonly Task[]>(() => {
    const list = activeTab === 'bundled' ? BUNDLED_RECIPES : userRecipes;
    const seen: Partial<Record<Task, true>> = {};
    for (const r of list) seen[r.task] = true;
    return ALL_TASKS.filter((t) => seen[t] === true);
  });

  function groupByTask(
    list: readonly Recipe[],
  ): readonly { task: Task; recipes: readonly Recipe[] }[] {
    const buckets: Partial<Record<Task, Recipe[]>> = {};
    for (const r of list) {
      const arr = buckets[r.task] ?? [];
      arr.push(r);
      buckets[r.task] = arr;
    }
    const groups: { task: Task; recipes: readonly Recipe[] }[] = [];
    for (const task of ALL_TASKS) {
      const recipes = buckets[task];
      if (recipes && recipes.length > 0) groups.push({ task, recipes });
    }
    return groups;
  }

  // A custom dialog, not confirmDialog, because the body renders a structured diff rather than a string.
  let applyTarget = $state<Recipe | null>(null);

  function openApplyConfirm(r: Recipe): void {
    applyTarget = r;
  }

  function closeApplyConfirm(): void {
    applyTarget = null;
  }

  async function confirmApplyFull(): Promise<void> {
    const r = applyTarget;
    closeApplyConfirm();
    if (!r) return;
    try {
      await onApplyFull(r);
      const action = onUndoApply
        ? {
            label: 'Undo',
            onClick: () => {
              void onUndoApply(r);
            },
          }
        : undefined;
      toastStore.push({
        message: `Applied "${r.label}".`,
        variant: 'success',
        ...(action ? { action } : {}),
      });
    } catch (e) {
      // The handler's saveVia already told the user the write did not land.
      debugCatch(e, 'options.RecipesGallery.applyFull');
    }
  }

  async function handleApplyRulesOnly(r: Recipe): Promise<void> {
    try {
      // The handler owns every message on this path: it knows how many rules actually landed.
      await onApplyRulesOnly(r);
    } catch (e) {
      debugCatch(e, 'options.RecipesGallery.applyRulesOnly');
    }
  }

  async function handleExport(r: Recipe): Promise<void> {
    const encoded = serialiseRecipe(r);
    try {
      await navigator.clipboard.writeText(encoded);
      toastStore.push({ message: 'Recipe copied to clipboard.', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'options.RecipesGallery.export');
      toastStore.push({
        message: 'Could not copy to the clipboard. Try again.',
        variant: 'danger',
      });
    }
  }

  async function handleDelete(r: Recipe): Promise<void> {
    const ok = await confirmDialog({
      title: 'Delete recipe',
      body: `Delete "${r.label}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await onDeleteUserRecipe(r.id);
      toastStore.push({ message: 'Recipe deleted.', variant: 'success' });
    } catch (e) {
      debugCatch(e, 'options.RecipesGallery.delete');
      toastStore.push({ message: 'Could not delete recipe.', variant: 'danger' });
    }
  }

  // ---- New-from-current dialog ----
  let newOpen = $state(false);

  function openNew(): void {
    newOpen = true;
  }
  function closeNew(): void {
    newOpen = false;
  }
  function handleNewSuccess(label: string): void {
    closeNew();
    toastStore.push({ message: `Saved "${label}".`, variant: 'success' });
    activeTab = 'yours';
  }

  // ---- Paste-shared dialog ----
  let pasteOpen = $state(false);

  function openPaste(): void {
    pasteOpen = true;
  }
  function closePaste(): void {
    pasteOpen = false;
  }
  function handlePasteSuccess(): void {
    toastStore.push({ message: 'Recipe imported.', variant: 'success' });
    activeTab = 'yours';
  }
  function handlePasteFailure(e: unknown): void {
    debugCatch(e, 'options.RecipesGallery.import');
    toastStore.push({ message: 'Could not import recipe.', variant: 'danger' });
  }

  const TABS: ReadonlyArray<Tab> = ['bundled', 'yours'];

  function onTabKeydown(e: KeyboardEvent): void {
    const idx = TABS.indexOf(activeTab);
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (target !== undefined) {
      activeTab = target;
      const el = e.currentTarget as HTMLElement;
      el.querySelector<HTMLElement>(`[data-ega-recipes-tab="${target}"]`)?.focus();
    }
  }
</script>

{#snippet groupList(groups: readonly { task: Task; recipes: readonly Recipe[] }[], isUser: boolean)}
  {#each groups as group (group.task)}
    <section class="group" data-ega-recipes-group={group.task}>
      <h3 class="group-title">{TASK_LABELS[group.task]}</h3>
      <ul class="cards" role="list">
        {#each group.recipes as r (r.id)}
          <RecipeCard
            recipe={r}
            {isUser}
            onApply={openApplyConfirm}
            onApplyRulesOnly={(rr) => void handleApplyRulesOnly(rr)}
            onExport={(rr) => void handleExport(rr)}
            onDelete={(rr) => void handleDelete(rr)}
          />
        {/each}
      </ul>
    </section>
  {/each}
{/snippet}

<div class="recipes-gallery" data-ega-recipes-gallery>
  <div class="head">
    <!-- tabindex -1: roving focus lives on the tabs; the container only delegates keys. -->
    <div
      class="tabs"
      role="tablist"
      aria-label="Recipe source"
      tabindex="-1"
      onkeydown={onTabKeydown}
    >
      <button
        type="button"
        role="tab"
        class="tab"
        data-ega-recipes-tab="bundled"
        aria-selected={activeTab === 'bundled'}
        tabindex={activeTab === 'bundled' ? 0 : -1}
        onclick={() => (activeTab = 'bundled')}
      >
        Bundled
        <span class="tab-count">{BUNDLED_RECIPES.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        data-ega-recipes-tab="yours"
        aria-selected={activeTab === 'yours'}
        tabindex={activeTab === 'yours' ? 0 : -1}
        onclick={() => (activeTab = 'yours')}
      >
        Yours
        <span class="tab-count">{userRecipes.length}</span>
      </button>
    </div>
    <div class="head-actions">
      <Button
        variant="primary"
        size="sm"
        dataAttrs={{ 'data-ega-recipe-new': 'true' }}
        onclick={openNew}
      >
        + New from current
      </Button>
      <Button
        variant="secondary"
        size="sm"
        dataAttrs={{ 'data-ega-recipe-paste': 'true' }}
        onclick={openPaste}
      >
        Paste shared
      </Button>
    </div>
  </div>

  {#if availableFilterTasks.length > 1}
    <div class="filter-chips" role="group" aria-label="Filter recipes by task">
      <button
        type="button"
        class="filter-chip"
        class:active={filterTask === 'all'}
        data-ega-recipe-filter="all"
        onclick={() => (filterTask = 'all')}
      >
        All
      </button>
      {#each availableFilterTasks as t (t)}
        <button
          type="button"
          class="filter-chip"
          class:active={filterTask === t}
          data-ega-recipe-filter={t}
          onclick={() => (filterTask = t)}
        >
          {TASK_LABELS[t]}
        </button>
      {/each}
    </div>
  {/if}

  {#if activeTab === 'bundled'}
    {#if groupedBundled.length === 0}
      <EmptyState title="No bundled recipes yet" />
    {:else}
      {@render groupList(groupedBundled, false)}
    {/if}
  {:else if groupedUser.length === 0}
    <EmptyState
      title="No saved recipes yet"
      description="Click + New from current to save one task's template, rules and generation settings as a recipe, or paste a shared one."
    />
  {:else}
    {@render groupList(groupedUser, true)}
  {/if}
</div>

{#if applyTarget}
  <RecipeApplyConfirmDialog
    recipe={applyTarget}
    onCancel={closeApplyConfirm}
    onConfirm={() => void confirmApplyFull()}
  />
{/if}

{#if newOpen}
  <RecipeNewDialog onClose={closeNew} onSubmit={onSaveCurrentAs} onSuccess={handleNewSuccess} />
{/if}

{#if pasteOpen}
  <RecipePasteDialog
    onClose={closePaste}
    {onImport}
    onSuccess={handlePasteSuccess}
    onFailure={handlePasteFailure}
  />
{/if}

<style>
  .recipes-gallery {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .tabs {
    display: inline-flex;
    gap: var(--space-1);
    padding: 2px;
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
  }
  .tab {
    appearance: none;
    background: transparent;
    border: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--color-muted);
    font-size: var(--fs-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .tab[aria-selected='true'] {
    background: var(--color-bg);
    color: var(--color-fg);
    box-shadow: 0 1px 0 var(--color-border-subtle);
  }
  .tab:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .tab-count {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    background: var(--color-bg-sunken);
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    min-width: 18px;
    text-align: center;
  }
  .head-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-2) 0;
  }
  .filter-chip {
    appearance: none;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-fg);
    padding: 2px var(--space-2);
    font: inherit;
    font-size: var(--fs-sm);
    /* After `font: inherit`, which resets weight. Constant across states so
       selecting a chip does not re-measure the row. */
    font-weight: 500;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .filter-chip:hover:not(.active) {
    background: var(--color-bg-hover);
  }
  .filter-chip.active {
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
  .filter-chip:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .group-title {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-2);
  }
</style>
