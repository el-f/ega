<script lang="ts">
  import { tick } from 'svelte';
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import Grip from '@lucide/svelte/icons/grip-vertical';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import type { AnswerField, FieldKind, FieldRole } from '@/shared/answer/spec';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import { id as makeId } from '@/shared/uuid';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import InfoTip from '@/shared/ui/InfoTip.svelte';

  interface Props {
    fields: readonly AnswerField[];
    onchange: (fields: AnswerField[]) => void;
  }
  let { fields, onchange }: Props = $props();
  const uid = makeId('ega-answer-fields');
  let openKey = $state<string | null>(null);
  type DragField = AnswerField & { id: string };
  const shadow = useShadowSync<DragField>({
    seed: () => fields.filter((f) => f.role !== 'main').map((f) => ({ ...f, id: f.key })),
    keyOf: (rows) => JSON.stringify(rows),
  });
  const main = $derived(fields.find((f) => f.role === 'main'));
  const kinds: Array<{ value: FieldKind; label: string }> = [
    { value: 'text', label: 'Text' },
    { value: 'list', label: 'List' },
    { value: 'yesno', label: 'Yes or no' },
    { value: 'choice', label: 'One of' },
    { value: 'score', label: 'Score (0 to 100%)' },
  ];
  const roles: Array<{ value: FieldRole; label: string }> = [
    { value: 'notes', label: 'Notes' },
    { value: 'details', label: 'About this reply only' },
    { value: 'hidden', label: 'Not shown' },
  ];
  const kindLabel = (kind: FieldKind) => kinds.find((k) => k.value === kind)?.label ?? 'Text';
  const roleLabel = (role: FieldRole) =>
    role === 'main' ? 'Main answer' : (roles.find((r) => r.value === role)?.label ?? 'Notes');

  function patch(key: string, patch: Partial<AnswerField>): void {
    onchange(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }
  async function add(): Promise<void> {
    if (fields.length >= 8) return;
    let n = 1;
    while (fields.some((f) => f.key === `field${n}` || f.label === `Field ${n}`)) n++;
    const key = `field${n}`;
    onchange([
      ...fields,
      { key, label: `Field ${n}`, kind: 'text', role: 'notes', required: false },
    ]);
    openKey = key;
    await tick();
    document.getElementById(`${uid}-${key}-name`)?.focus();
  }
  function move(key: string, direction: -1 | 1): void {
    const rows = fields.filter((f) => f.role !== 'main');
    const from = rows.findIndex((f) => f.key === key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= rows.length || !main) return;
    const row = rows.splice(from, 1)[0];
    if (!row) return;
    rows.splice(to, 0, row);
    onchange([main, ...rows]);
  }
  function finishDrag(e: CustomEvent<{ items: DragField[] }>): void {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const rows = e.detail.items
      .filter((f) => !isShadowRow(f))
      .flatMap((f) => {
        const live = byKey.get(f.id);
        return live ? [live] : [];
      });
    shadow.items = rows.map((f) => ({ ...f, id: f.key }));
    if (main) onchange([main, ...rows]);
  }
  function pointerGrip(node: HTMLElement): { destroy: () => void } {
    const handle = dragHandle(node);
    const quiet = () => {
      node.tabIndex = -1;
      node.removeAttribute('role');
    };
    quiet();
    const watcher = new MutationObserver(() => {
      if (node.tabIndex !== -1 || node.hasAttribute('role')) quiet();
    });
    watcher.observe(node, { attributes: true, attributeFilter: ['tabindex', 'role'] });
    return {
      destroy() {
        watcher.disconnect();
        handle.destroy();
      },
    };
  }
</script>

<section class="af-editor" aria-labelledby="{uid}-title" data-ega-answer-fields-editor>
  <div class="af-heading">
    <h3 id="{uid}-title">Answer fields</h3>
    <InfoTip
      label="About answer fields"
      text="Choose what the answer contains and where each part appears. Ega writes the format for the model, so you do not have to write JSON."
    />
    <Button
      variant="secondary"
      size="sm"
      ariaDisabled={fields.length >= 8}
      {...fields.length >= 8 ? { describedBy: `${uid}-cap` } : {}}
      onclick={() => void add()}>Add field</Button
    >
  </div>
  {#if fields.length >= 8}<p class="af-hint" id="{uid}-cap" data-ega-disabled-reason>
      8 fields at most
    </p>{/if}
  {#if main}{@render row(main, true, 0, 1)}{/if}
  <ul
    class="af-list"
    aria-label="Additional answer fields"
    use:dragHandleZone={{
      items: shadow.items,
      type: uid,
      flipDurationMs: 0,
      dropTargetStyle: {},
      zoneTabIndex: -1,
      autoAriaDisabled: true,
    }}
    onconsider={(e) => {
      shadow.items = e.detail.items;
    }}
    onfinalize={finishDrag}
  >
    {#each shadow.items as field, index (field.id)}
      <li class="af-list-item">
        {#if isShadowRow(field)}<span aria-hidden="true">Drop here</span>{:else}{@render row(
            field,
            false,
            index,
            shadow.items.length,
          )}{/if}
      </li>
    {/each}
  </ul>
</section>

{#snippet row(field: AnswerField, locked: boolean, index: number, count: number)}
  <div class="af-row" data-ega-answer-field={field.key}>
    <div class="af-summary">
      {#if !locked}<span class="af-grip" use:pointerGrip aria-hidden="true"><Grip size={16} /></span
        >{/if}
      <span class="af-name">{field.label || 'Name needed'}</span>
      <span class="af-kind"
        >{kindLabel(field.kind)} · {roleLabel(field.role)} · {field.required
          ? 'Always'
          : 'When it applies'}</span
      >
      <Button
        variant="ghost"
        size="sm"
        ariaLabel={`Edit ${field.label || 'field'}`}
        dataAttrs={{ 'aria-expanded': openKey === field.key }}
        onclick={() => {
          openKey = openKey === field.key ? null : field.key;
        }}>Edit</Button
      >
      {#if !locked}
        <IconButton
          icon={ArrowUp}
          size="sm"
          ariaLabel={`Move ${field.label} up`}
          disabled={index === 0}
          onclick={() => move(field.key, -1)}
        />
        <IconButton
          icon={ArrowDown}
          size="sm"
          ariaLabel={`Move ${field.label} down`}
          disabled={index === count - 1}
          onclick={() => move(field.key, 1)}
        />
        <Button
          variant="ghost"
          size="sm"
          ariaLabel={`Delete ${field.label}`}
          onclick={() => {
            onchange(fields.filter((f) => f.key !== field.key));
            if (openKey === field.key) openKey = null;
          }}>Delete</Button
        >
      {/if}
    </div>
    {#if openKey === field.key}
      <div class="af-edit">
        <Input
          id={`${uid}-${field.key}-name`}
          label="Name"
          value={field.label}
          maxlength={40}
          oninput={(e) => patch(field.key, { label: (e.currentTarget as HTMLInputElement).value })}
        />
        <Select
          label="Kind"
          value={field.kind}
          options={locked ? kinds.filter((k) => k.value === 'text' || k.value === 'list') : kinds}
          onchange={(kind) =>
            patch(field.key, {
              kind,
              ...(kind === 'choice' && !field.choices ? { choices: ['Option 1', 'Option 2'] } : {}),
            })}
        />
        {#if locked}<p class="af-hint">Main answer · Always filled · Stays first</p>{:else}
          <Select
            label="Shows as"
            value={field.role}
            options={roles}
            onchange={(role) => patch(field.key, { role })}
          />
          <Checkbox
            label="Always fill it"
            checked={field.required}
            onchange={(required) => patch(field.key, { required })}
          />
        {/if}
        {#if field.role === 'hidden'}<p class="af-hint">
            The model still writes it, which can improve the answer.
          </p>{/if}
        {#if field.kind === 'choice'}
          <Input
            label="Choices, separated by commas"
            value={field.choices?.join(', ') ?? ''}
            oninput={(e) =>
              patch(field.key, {
                choices: (e.currentTarget as HTMLInputElement).value
                  .split(',')
                  .map((s) => s.trim()),
              })}
          />
        {/if}
        <Input
          label="What goes here"
          value={field.guide ?? ''}
          maxlength={200}
          oninput={(e) => patch(field.key, { guide: (e.currentTarget as HTMLInputElement).value })}
        />
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .af-editor {
    display: grid;
    gap: var(--space-2);
  }
  .af-heading,
  .af-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .af-heading h3 {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .af-heading :global(.ega-btn) {
    margin-inline-start: auto;
  }
  .af-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
  .af-row {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    min-inline-size: 0;
  }
  .af-name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .af-kind,
  .af-hint {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .af-kind {
    flex: 1;
    min-inline-size: 12ch;
  }
  .af-hint {
    margin: 0;
  }
  .af-edit {
    display: grid;
    gap: var(--space-2);
    padding-block-start: var(--space-2);
  }
  .af-grip {
    display: inline-flex;
    cursor: grab;
    color: var(--color-muted);
  }
</style>
