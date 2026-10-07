<script lang="ts">
  /** One rule's fields: text, type, the tasks it applies to, sites. Add mode adds on its button; edit mode writes each field as it is left. */
  import { tick, untrack } from 'svelte';
  import { detectCategory, type RuleCategory } from '@/shared/rules';
  import type { TaskView } from '@/shared/task-view';
  import { RULE_BODY_MAX } from '@/shared/settings-schema';
  import { id as makeId } from '@/shared/uuid';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import RuleScopeToggles from './RuleScopeToggles.svelte';
  import { RULE_TYPES, parseSites, ruleTypeLabel, type RuleDraft } from './rule-fields';

  interface Props {
    mode: 'add' | 'edit';
    initial: RuleDraft;
    taskViews: readonly TaskView[];
    /** Edit mode: writes one changed part; false when the write failed. */
    onCommit?: (patch: Partial<RuleDraft>) => Promise<boolean>;
    /** Add mode: false when the write failed, so the text stays. */
    onAdd?: (draft: RuleDraft) => Promise<boolean>;
    onCancel?: () => void;
    onDelete?: () => void;
    /** Esc: edit mode closes, add mode cancels. */
    onClose: () => void;
  }

  const { mode, initial, taskViews, onCommit, onAdd, onCancel, onDelete, onClose }: Props =
    $props();

  const uid = makeId('ega-rule-editor');
  let body = $state(untrack(() => initial.body));
  let category = $state<RuleCategory>(untrack(() => initial.category));
  let tasks = $state<string[]>(untrack(() => [...initial.tasks]));
  let sitesText = $state(untrack(() => initial.sites.join(', ')));
  /** The values the store has, so a field left unchanged writes nothing. */
  let stored = untrack(() => ({
    ...initial,
    tasks: [...initial.tasks],
    sites: [...initial.sites],
  }));
  // Add mode guesses the type from the text until the user picks one.
  let typePicked = untrack(() => mode === 'edit');
  let bodyError = $state<string | null>(null);
  let saved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let root = $state<HTMLElement | null>(null);

  $effect(() => () => clearTimeout(savedTimer));

  async function commit(patch: Partial<RuleDraft>): Promise<void> {
    if (!onCommit || !(await onCommit(patch))) return;
    stored = { ...stored, ...patch };
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), 2000);
  }

  function checkBody(): string | null {
    const text = body.trim();
    bodyError = text === '' ? 'Write the rule text' : null;
    return bodyError === null ? text : null;
  }

  async function leaveBody(): Promise<void> {
    if (mode !== 'edit') return;
    const text = checkBody();
    if (text !== null && text !== stored.body) await commit({ body: text });
  }

  async function leaveSites(): Promise<void> {
    if (mode !== 'edit') return;
    const sites = parseSites(sitesText);
    if (sites.join(',') !== stored.sites.join(',')) await commit({ sites });
  }

  function pickType(next: RuleCategory): void {
    category = next;
    typePicked = true;
    if (mode === 'edit' && next !== stored.category) void commit({ category: next });
  }

  function setTasks(next: string[]): void {
    tasks = next;
    if (mode === 'edit') void commit({ tasks: next });
  }

  async function add(): Promise<void> {
    const text = checkBody();
    if (text === null) {
      await tick();
      root?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      return;
    }
    await onAdd?.({ body: text, category, tasks, sites: parseSites(sitesText) });
  }

  async function onKeydown(e: KeyboardEvent): Promise<void> {
    if (e.key !== 'Escape' || e.isComposing) return;
    // A select or popover that is open owns its Esc.
    if ((e.target as Element | null)?.closest('[data-ega-owns-escape]')) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'edit') {
      // Closing removes the focused field before its blur runs, so the field is written here.
      await leaveBody();
      await leaveSites();
    }
    onClose();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="rule-editor" bind:this={root} onkeydown={(e) => void onKeydown(e)}>
  <div>
    <Textarea
      label="Rule text"
      rows={2}
      maxlength={RULE_BODY_MAX}
      placeholder="e.g. Keep product names in English"
      bind:value={body}
      oninput={() => {
        if (bodyError !== null && body.trim() !== '') bodyError = null;
        if (!typePicked) category = detectCategory(body);
      }}
      onblur={() => void leaveBody()}
      dataAttrs={{
        [mode === 'add' ? 'data-ega-manual-body' : 'data-ega-rule-body-editor']: true,
        'aria-invalid': bodyError !== null ? 'true' : undefined,
        'aria-describedby': bodyError !== null ? `${uid}-body-error` : undefined,
      }}
    />
    {#if bodyError}
      <p class="re-error" id="{uid}-body-error">{bodyError}</p>
    {/if}
  </div>
  <div class="re-type">
    <Select
      label="Type"
      size="sm"
      value={category}
      options={RULE_TYPES.map((c) => ({ value: c, label: ruleTypeLabel(c) }))}
      selectAttrs={{ 'data-ega-rule-category': true }}
      onchange={(v) => pickType(v)}
    />
  </div>
  <div class="re-field">
    <span class="re-label" id="{uid}-scope">Applies to</span>
    <RuleScopeToggles {tasks} {taskViews} labelId="{uid}-scope" onchange={setTasks} />
  </div>
  <div class="re-field">
    <Input
      label="Sites (optional)"
      bind:value={sitesText}
      placeholder="e.g. twitter.com, example.com"
      onblur={() => void leaveSites()}
      dataAttrs={{
        [mode === 'add' ? 'data-ega-manual-sites' : 'data-ega-rule-sites']: true,
        'aria-describedby': `${uid}-sites-hint`,
      }}
    />
    <p class="re-hint" id="{uid}-sites-hint">Separate sites with commas</p>
  </div>
  <div class="re-actions">
    {#if mode === 'add'}
      <Button
        variant="primary"
        dataAttrs={{ 'data-ega-manual-submit': true }}
        onclick={() => void add()}>Add rule</Button
      >
      <Button variant="ghost" onclick={() => onCancel?.()}>Cancel</Button>
    {:else}
      <Button
        variant="ghost"
        iconKind="delete"
        dataAttrs={{ 'data-ega-rule-delete': true }}
        onclick={() => onDelete?.()}>Delete rule</Button
      >
      <span class="re-saved" role="status">{saved ? 'Saved' : ''}</span>
    {/if}
  </div>
</div>

<style>
  .rule-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block: var(--space-2);
  }
  .re-type {
    max-width: 14rem;
  }
  .re-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .re-label {
    font-size: var(--fs-base);
  }
  .re-hint,
  .re-error {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .re-hint {
    color: var(--color-muted);
  }
  .re-error {
    color: var(--color-danger-fg);
  }
  .re-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .re-saved {
    font-size: var(--fs-base);
    color: var(--color-success-fg);
  }
</style>
