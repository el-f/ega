<script lang="ts">
  import type { Rule, RuleCategory } from '@/shared/rules';
  import { detectCategory, normaliseSiteEntry } from '@/shared/rules';
  import { uuid } from '@/shared/uuid';
  import { getSettings } from '@/shared/storage';
  import { SHIPPED_TASK_VIEWS, type TaskId, type TaskView } from '@/shared/task-view';
  import { tick } from 'svelte';
  import { toastStore } from '@/shared/components/toastStore';
  import RulesEditorManualForm from './RulesEditorManualForm.svelte';
  import RulesEditorRow from './RulesEditorRow.svelte';
  import RulesEditorEmpty from './RulesEditorEmpty.svelte';

  interface Props {
    rules: readonly Rule[];
    /** Returns false when the write failed, so no Saved, Undo or new-row state follows it. */
    onUpdate: (rules: readonly Rule[]) => void | boolean | Promise<void | boolean>;
    /** The tab's live task list, so a task made, renamed or turned off here shows at once. */
    taskViews?: readonly TaskView[];
  }

  const { rules, onUpdate, taskViews = SHIPPED_TASK_VIEWS }: Props = $props();

  let formOpen = $state(false);
  /** The row just added; it scrolls into view and pulses once. */
  let justAddedId = $state<string | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  async function commit(next: readonly Rule[]): Promise<boolean> {
    return (await onUpdate(next)) !== false;
  }

  async function patchRule(id: string, patch: Partial<Rule>): Promise<boolean> {
    const next = rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
    return commit(next);
  }

  // The form closes around the focused button, so focus moves to a control that is still on screen.
  async function focusInEditor(selector: string, opts?: { preventScroll: boolean }): Promise<void> {
    await tick();
    rootEl?.querySelector<HTMLElement>(selector)?.focus(opts);
  }

  function onFormCancel(): void {
    void focusInEditor(
      rules.length === 0 ? '[data-ega-rules-empty] button' : 'summary.manual-summary',
    );
  }

  async function deleteRuleById(id: string): Promise<void> {
    const targetIdx = rules.findIndex((r) => r.id === id);
    if (targetIdx < 0) return;
    const target = rules[targetIdx];
    if (!target) return;
    const snapshot = target;
    const insertAt = targetIdx;
    if (!(await commit(rules.filter((r) => r.id !== id)))) return;
    toastStore.push({
      message: 'Rule deleted.',
      variant: 'success',
      action: {
        label: 'Undo',
        // Re-read at click time: the closed-over prop is a stale snapshot, and Undo would drop the deletes since.
        onClick: () => {
          void (async () => {
            const s = await getSettings();
            const current = s.advanced.rules;
            const next = [...current];
            const clampedIdx = Math.min(insertAt, next.length);
            next.splice(clampedIdx, 0, snapshot);
            await commit(next);
          })();
        },
      },
    });
  }

  function pushScopeUndo(id: string, priorScope: Rule['scope'], message: string): void {
    toastStore.push({
      message,
      variant: 'success',
      action: {
        label: 'Undo',
        // Re-read canonical rules at click-time so the restore patches the
        // live rule, not the closed-over `rules` prop snapshot.
        onClick: () => {
          void (async () => {
            const s = await getSettings();
            const next = s.advanced.rules.map((r) =>
              r.id === id ? { ...r, scope: priorScope } : r,
            );
            await commit(next);
          })();
        },
      },
    });
  }

  async function toggleTaskOnRule(id: string, task: string): Promise<void> {
    const r = rules.find((x) => x.id === id);
    if (!r) return;
    const has = r.scope.tasks.includes(task);
    if (has && r.scope.tasks.length === 1) {
      // An empty task list means every task, so removing the last chip would widen the rule.
      toastStore.push({
        message: 'A rule needs at least one task. Use Edit scope to apply it to all tasks.',
        variant: 'info',
      });
      return;
    }
    const tasks = has ? r.scope.tasks.filter((t) => t !== task) : [...r.scope.tasks, task];
    await setRuleTasks(id, tasks, has ? 'Task removed from rule.' : null);
  }

  /** An empty list is the explicit "all tasks" scope. */
  async function setRuleTasks(
    id: string,
    tasks: readonly string[],
    undoMessage: string | null,
  ): Promise<void> {
    const r = rules.find((x) => x.id === id);
    if (!r) return;
    const nextScope: Rule['scope'] =
      r.scope.sites !== undefined
        ? { tasks: [...tasks], sites: r.scope.sites }
        : { tasks: [...tasks] };
    const priorScope = r.scope;
    if (!(await patchRule(id, { scope: nextScope }))) return;
    if (undoMessage !== null) pushScopeUndo(id, priorScope, undoMessage);
  }

  async function removeSiteFromRule(id: string, site: string): Promise<void> {
    const r = rules.find((x) => x.id === id);
    if (!r || !r.scope.sites) return;
    const sites = r.scope.sites.filter((s) => s !== site);
    const nextScope: Rule['scope'] =
      sites.length === 0 ? { tasks: r.scope.tasks } : { tasks: r.scope.tasks, sites };
    const priorScope = r.scope;
    if (!(await patchRule(id, { scope: nextScope }))) return;
    pushScopeUndo(id, priorScope, 'Site removed from rule.');
  }

  async function submitManual(payload: {
    body: string;
    tasks: readonly TaskId[];
    sites: readonly string[];
  }): Promise<boolean> {
    const sites = [...new Set(payload.sites.map(normaliseSiteEntry).filter((s) => s !== ''))];
    const scope: Rule['scope'] =
      sites.length > 0 ? { tasks: [...payload.tasks], sites } : { tasks: [...payload.tasks] };
    const rule: Rule = {
      id: uuid(),
      body: payload.body,
      category: detectCategory(payload.body),
      scope,
      source: 'manual',
      addedAt: new Date().toISOString(),
      enabled: true,
    };
    if (!(await commit([...rules, rule]))) return false;
    justAddedId = rule.id;
    formOpen = false;
    // The row's own effect scrolls it into view, honouring reduced motion.
    void focusInEditor(`[data-rule-id="${rule.id}"] [data-ega-rule-body]`, { preventScroll: true });
    return true;
  }
</script>

<div class="rules-editor" class:empty={rules.length === 0} data-ega-rules-editor bind:this={rootEl}>
  {#if rules.length === 0}
    <RulesEditorEmpty onAdd={() => (formOpen = true)} />
  {:else}
    <div class="active-rules">
      <h4 class="active-rules-heading">Rules ({rules.length})</h4>
      <ul class="rule-list" role="list">
        {#each rules as r (r.id)}
          <RulesEditorRow
            rule={r}
            {taskViews}
            highlight={r.id === justAddedId}
            onBodyChange={(body) => patchRule(r.id, { body })}
            onCategoryChange={(category: RuleCategory) => void patchRule(r.id, { category })}
            onToggleEnabled={() => void patchRule(r.id, { enabled: !r.enabled })}
            onToggleTask={(t) => toggleTaskOnRule(r.id, t)}
            onSetTasks={(tasks, undoMessage) => setRuleTasks(r.id, tasks, undoMessage)}
            onRemoveSite={(s) => removeSiteFromRule(r.id, s)}
            onDelete={() => deleteRuleById(r.id)}
          />
        {/each}
      </ul>
    </div>
  {/if}

  <RulesEditorManualForm
    bind:open={formOpen}
    onSubmit={submitManual}
    onCancel={onFormCancel}
    {...taskViews.length > 0 ? { taskViews } : {}}
  />
</div>

<style>
  .rules-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  /* With no rules the empty state's button is the way in; the closed form stays in the DOM for the Add-a-rule shortcut. */
  .rules-editor.empty :global(details.manual-block:not([open])) {
    display: none;
  }
  .active-rules {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .active-rules-heading {
    margin: 0;
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--color-fg-subtle);
  }
  .rule-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
