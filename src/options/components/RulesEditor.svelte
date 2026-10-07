<script lang="ts">
  /** The Rules card: one row per rule, Edit opens its fields below it, and Add rule opens the same fields as a draft at the top. */
  import type { Rule } from '@/shared/rules';
  import { uuid } from '@/shared/uuid';
  import { getSettings } from '@/shared/storage';
  import { RULES_MAX } from '@/shared/settings-schema';
  import { estimateRulesBlockBytes, RULES_BLOCK_WARN_BYTES } from '@/shared/rules-budget';
  import { SHIPPED_TASK_VIEWS, type TaskView } from '@/shared/task-view';
  import { tick } from 'svelte';
  import { toastStore } from '@/shared/components/toastStore';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import RulesEditorRow from './RulesEditorRow.svelte';
  import RulesEditorEmpty from './RulesEditorEmpty.svelte';
  import RuleEditor from './rules/RuleEditor.svelte';
  import { ruleScope, type RuleDraft } from './rules/rule-fields';

  interface Props {
    rules: readonly Rule[];
    /** Returns false when the write failed, so no Saved, Undo or new-row state follows it. */
    onUpdate: (rules: readonly Rule[]) => void | boolean | Promise<void | boolean>;
    /** The tab's live task list, so a task made, renamed or turned off elsewhere shows at once. */
    taskViews?: readonly TaskView[];
  }

  const { rules, onUpdate, taskViews = SHIPPED_TASK_VIEWS }: Props = $props();

  const EMPTY_DRAFT: RuleDraft = { body: '', category: 'unknown', tasks: [], sites: [] };

  let adding = $state(false);
  let openId = $state<string | null>(null);
  /** The row just added; it scrolls into view and pulses once. */
  let justAddedId = $state<string | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  const atCap = $derived(rules.length >= RULES_MAX);
  // Site- and task-scoped rules only render for their own host and task, so the warning tracks the biggest single request.
  const overBudget = $derived.by(() => {
    const hosts = [undefined, ...new Set(rules.flatMap((r) => r.scope.sites ?? []))];
    return taskViews.some(({ id }) =>
      hosts.some((host) => estimateRulesBlockBytes(rules, id, host) > RULES_BLOCK_WARN_BYTES),
    );
  });

  async function commit(next: readonly Rule[]): Promise<boolean> {
    return (await onUpdate(next)) !== false;
  }

  async function focusIn(selector: string): Promise<void> {
    await tick();
    rootEl?.querySelector<HTMLElement>(selector)?.focus();
  }

  /** The Add rule button: in the header once there are rules, else the empty state's. */
  const ADD_SELECTOR = '[data-ega-rules-add], [data-ega-rules-empty] button';

  function startAdd(): void {
    if (atCap) return;
    adding = true;
    void focusIn('[data-ega-manual-body]');
  }

  function cancelAdd(): void {
    adding = false;
    void (async () => {
      await tick();
      document.querySelector<HTMLElement>(ADD_SELECTOR)?.focus();
    })();
  }

  async function add(d: RuleDraft): Promise<boolean> {
    const rule: Rule = {
      id: uuid(),
      body: d.body,
      category: d.category,
      scope: ruleScope(d.tasks, d.sites),
      source: 'manual',
      addedAt: new Date().toISOString(),
      enabled: true,
    };
    if (!(await commit([...rules, rule]))) return false;
    adding = false;
    justAddedId = rule.id;
    void focusIn(`[data-rule-id="${rule.id}"] input[type="checkbox"]`);
    return true;
  }

  function patchFor(r: Rule, p: Partial<RuleDraft>): Rule {
    const next: Rule = { ...r };
    if (p.body !== undefined) next.body = p.body;
    if (p.category !== undefined) next.category = p.category;
    if (p.tasks !== undefined || p.sites !== undefined) {
      next.scope = ruleScope(p.tasks ?? r.scope.tasks, p.sites ?? r.scope.sites ?? []);
    }
    return next;
  }

  async function commitRule(id: string, p: Partial<RuleDraft>): Promise<boolean> {
    return commit(rules.map((r) => (r.id === id ? patchFor(r, p) : r)));
  }

  async function toggleOpen(id: string): Promise<void> {
    const opening = openId !== id;
    openId = opening ? id : null;
    await focusIn(
      opening ? `[data-rule-id="${id}"] textarea` : `[data-rule-id="${id}"] [data-ega-rule-edit]`,
    );
  }

  async function deleteRule(id: string): Promise<void> {
    const at = rules.findIndex((r) => r.id === id);
    const snapshot = rules[at];
    if (!snapshot) return;
    const after = rules[at + 1]?.id ?? rules[at - 1]?.id ?? null;
    if (!(await commit(rules.filter((r) => r.id !== id)))) return;
    if (openId === id) openId = null;
    await tick();
    // Focus goes to the next row, else the previous one, else the Add rule button.
    (after !== null
      ? rootEl?.querySelector<HTMLElement>(`[data-rule-id="${after}"] input[type="checkbox"]`)
      : document.querySelector<HTMLElement>(ADD_SELECTOR)
    )?.focus();
    const name =
      snapshot.body.length > 40 ? `${snapshot.body.slice(0, 40).trimEnd()}…` : snapshot.body;
    toastStore.push({
      message: `Deleted "${name}"`,
      variant: 'success',
      action: {
        label: 'Undo',
        // Re-read at click time: the closed-over prop is a stale snapshot, and Undo would drop the deletes since.
        onClick: () => {
          void (async () => {
            const current = (await getSettings()).advanced.rules;
            const next = [...current];
            next.splice(Math.min(at, next.length), 0, snapshot);
            if (await commit(next)) void focusIn(`[data-rule-id="${id}"] input[type="checkbox"]`);
          })();
        },
      },
    });
  }
</script>

<SectionCard
  title="Rules"
  description="Extra instructions for every task or only some"
  info={{
    label: 'About rules',
    text: 'Ega adds each rule that is on to the prompt of the tasks it applies to. A site list limits a rule to those sites.',
  }}
>
  {#snippet headerActions()}
    {#if rules.length > 0}
      <Button
        variant="secondary"
        size="sm"
        ariaDisabled={atCap}
        {...atCap ? { describedBy: 'ega-rules-cap' } : {}}
        dataAttrs={{ 'data-ega-rules-add': true, 'aria-expanded': adding ? 'true' : 'false' }}
        onclick={startAdd}>Add rule</Button
      >
    {/if}
  {/snippet}
  <div class="rules-editor" data-ega-setting="tasks.rules" data-ega-rules-editor bind:this={rootEl}>
    {#if atCap}
      <p class="rules-line" id="ega-rules-cap">You have the most rules Ega keeps ({RULES_MAX})</p>
    {/if}
    {#if overBudget}
      <p class="rules-line rules-budget-warn" role="alert" data-ega-rules-budget-warn>
        Your rules are over the {RULES_BLOCK_WARN_BYTES / 1024} KB limit, so Ega drops the least specific
        ones from each request.
      </p>
    {/if}
    {#if adding}
      <div class="rule-draft" data-ega-rule-draft>
        <RuleEditor
          mode="add"
          initial={EMPTY_DRAFT}
          {taskViews}
          onAdd={add}
          onCancel={cancelAdd}
          onClose={cancelAdd}
        />
      </div>
    {/if}
    {#if rules.length === 0}
      {#if !adding}<RulesEditorEmpty onAdd={startAdd} />{/if}
    {:else}
      <ul class="rule-list">
        {#each rules as r (r.id)}
          <RulesEditorRow
            rule={r}
            {taskViews}
            open={openId === r.id}
            highlight={r.id === justAddedId}
            onToggleOpen={() => void toggleOpen(r.id)}
            onToggleEnabled={() =>
              void commit(rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}
            onCommit={(p) => commitRule(r.id, p)}
            onDelete={() => deleteRule(r.id)}
          />
        {/each}
      </ul>
    {/if}
  </div>
</SectionCard>

<style>
  .rules-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .rules-line {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .rules-budget-warn {
    color: var(--color-warning-fg);
  }
  .rule-draft {
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .rule-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
