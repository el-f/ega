<script lang="ts">
  import { tick } from 'svelte';
  import { DropdownMenu } from 'bits-ui';
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
  import Grip from '@lucide/svelte/icons/grip-vertical';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Trash from '@lucide/svelte/icons/trash-2';
  import type { AnswerField, FieldKind } from '@/shared/answer/spec';
  import { describeField, KIND_NAMES, ROLE_NAMES } from '@/shared/answer/describe';
  import { fieldKey } from '@/shared/answer/field-key';
  import { fieldErrors } from '@/options/answer-fields';
  import { useShadowSync } from '@/shared/svelte/useShadowSync.svelte';
  import { isShadowRow } from '@/shared/dnd-shadow-row';
  import { id as makeId } from '@/shared/uuid';
  import Button from '@/shared/ui/Button.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';

  interface Props {
    fields: readonly AnswerField[];
    onchange: (fields: AnswerField[]) => void;
  }
  let { fields, onchange }: Props = $props();
  const uid = makeId('ega-answer-fields');
  let openId = $state<string | null>(null);
  let addButton = $state<HTMLElement | null>(null);
  // A row keeps one id while a rename changes its key, so its open editor and focus stay.
  const ids: Record<string, string> = {};
  let nextId = 1;
  const idOf = (key: string): string =>
    (ids[key] ??= Object.values(ids).includes(key) ? `${key}-${nextId++}` : key);
  type DragField = AnswerField & { id: string };
  const shadow = useShadowSync<DragField>({
    seed: () => fields.filter((f) => f.role !== 'main').map((f) => ({ ...f, id: idOf(f.key) })),
    keyOf: (rows) => JSON.stringify(rows),
  });
  const main = $derived(fields.find((f) => f.role === 'main'));
  const errors = $derived(fieldErrors(fields));
  const kindOption = (value: FieldKind) => ({
    value,
    label: value === 'score' ? `${KIND_NAMES.score} (0 to 100%)` : KIND_NAMES[value],
  });
  const kinds = (['text', 'list', 'yesno', 'choice', 'score'] as const).map(kindOption);
  const mainKinds = (['text', 'list'] as const).map(kindOption);
  const roles = (['notes', 'details', 'hidden'] as const).map((value) => ({
    value,
    label: ROLE_NAMES[value],
  }));

  function patch(key: string, patch: Partial<AnswerField>): void {
    onchange(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }
  function rekey(field: AnswerField, label: string, rest: Partial<AnswerField> = {}): void {
    const key = fieldKey(
      label,
      fields.filter((f) => f !== field).map((f) => f.key),
    );
    const id = idOf(field.key);
    delete ids[field.key];
    ids[key] = id;
    patch(field.key, { ...rest, key, label });
  }
  function rename(field: AnswerField, label: string): void {
    if (field.role === 'main') patch(field.key, { label });
    else rekey(field, label);
  }
  // The reader shows "explain" as text notes, so a field that stops being one leaves that key.
  function reshape(field: AnswerField, change: Partial<AnswerField>): void {
    const next = { ...field, ...change };
    if (field.key === 'explain' && (next.kind !== 'text' || next.role !== 'notes'))
      rekey(field, field.label, change);
    else patch(field.key, change);
  }
  async function add(): Promise<void> {
    if (fields.length >= 8) return;
    let n = 1;
    while (fields.some((f) => f.key === `field${n}` || f.label === `Field ${n}`)) n++;
    const label = `Field ${n}`;
    const key = fieldKey(
      label,
      fields.map((f) => f.key),
    );
    onchange([...fields, { key, label, kind: 'text', role: 'notes', required: false }]);
    openId = idOf(key);
    await tick();
    document.getElementById(`${uid}-${openId}-name`)?.focus();
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
  // The deleted row takes its More button with it, so focus goes to Add field, not the page.
  let deleted = false;
  function remove(field: AnswerField, rowId: string): void {
    deleted = true;
    onchange(fields.filter((f) => f.key !== field.key));
    if (openId === rowId) openId = null;
    void tick().then(focusAdd);
  }
  const focusAdd = (): void => addButton?.querySelector<HTMLElement>('button')?.focus();
  function afterMenu(e: Event): void {
    if (!deleted) return;
    deleted = false;
    e.preventDefault();
    focusAdd();
  }
  function finishDrag(e: CustomEvent<{ items: DragField[] }>): void {
    const byId = new Map(fields.map((f) => [idOf(f.key), f]));
    const rows = e.detail.items
      .filter((f) => !isShadowRow(f))
      .flatMap((f) => {
        const live = byId.get(f.id);
        return live ? [live] : [];
      });
    shadow.items = rows.map((f) => ({ ...f, id: idOf(f.key) }));
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

<div class="af-editor" data-ega-answer-fields-editor>
  {#if main}{@render row(main, true, 0, 1)}{/if}
  <ul
    class="af-list"
    aria-label="More fields"
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
  <div class="af-add" bind:this={addButton}>
    <Button
      variant="secondary"
      size="sm"
      ariaDisabled={fields.length >= 8}
      {...fields.length >= 8 ? { describedBy: `${uid}-cap` } : {}}
      onclick={() => void add()}>Add field</Button
    >
    {#if fields.length >= 8}<p class="af-hint" id="{uid}-cap" data-ega-disabled-reason>
        8 fields at most
      </p>{/if}
  </div>
</div>

{#snippet row(field: AnswerField, locked: boolean, index: number, count: number)}
  {@const rowId = idOf(field.key)}
  {@const open = openId === rowId}
  {@const name = field.label || 'Name needed'}
  {@const error = errors.get(field.key)}
  {@const errId = `${uid}-${rowId}-err`}
  <div class="af-row" class:af-invalid={error !== undefined} data-ega-answer-field={field.key}>
    <div class="af-summary">
      <span class="af-grip" aria-hidden="true"
        >{#if !locked}<span class="af-grip-handle" use:pointerGrip><Grip size={16} /></span
          >{/if}</span
      >
      <span class="af-name">{name}</span>
      <span class="af-line">{describeField(field)}</span>
      <span class="af-actions">
        <Button
          variant="ghost"
          size="sm"
          ariaLabel={`${open ? 'Close' : 'Edit'} ${field.label || 'field'}`}
          labels={['Edit', 'Close']}
          dataAttrs={{
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': open ? `${uid}-${rowId}-edit` : undefined,
          }}
          onclick={() => {
            openId = open ? null : rowId;
          }}>{open ? 'Close' : 'Edit'}</Button
        >
        {#if !locked}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger class="af-more" aria-label={`More for ${name}`}>
              <Icon icon={Ellipsis} size={16} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                class="af-menu"
                align="end"
                sideOffset={4}
                collisionPadding={12}
                preventScroll={false}
                onCloseAutoFocus={afterMenu}
              >
                <DropdownMenu.Item
                  class="af-menu-item"
                  disabled={index === 0}
                  onSelect={() => move(field.key, -1)}
                >
                  <Icon icon={ArrowUp} size={16} />Move up
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  class="af-menu-item"
                  disabled={index === count - 1}
                  onSelect={() => move(field.key, 1)}
                >
                  <Icon icon={ArrowDown} size={16} />Move down
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  class="af-menu-item af-menu-danger"
                  onSelect={() => remove(field, rowId)}
                >
                  <Icon icon={Trash} size={16} />Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}
      </span>
    </div>
    {#if error && !open}<p class="af-error" id={errId}>{error.name ?? error.choices}</p>{/if}
    {#if open}
      <div class="af-edit" id="{uid}-{rowId}-edit">
        <div class="af-field">
          <Input
            id={`${uid}-${rowId}-name`}
            label="Name"
            value={field.label}
            maxlength={40}
            oninput={(e) => rename(field, (e.currentTarget as HTMLInputElement).value)}
            dataAttrs={error?.name
              ? { 'aria-invalid': 'true', 'aria-describedby': `${errId}-name` }
              : {}}
          />
          {#if error?.name}<p class="af-error" id="{errId}-name">{error.name}</p>{/if}
        </div>
        {#if locked}
          <div class="af-choice">
            <span class="af-label" id="{uid}-{rowId}-kind">Kind</span>
            <RadioGroup
              value={field.kind}
              options={mainKinds}
              orientation="horizontal"
              onValueChange={(kind) =>
                patch(field.key, { kind: kind === 'list' ? 'list' : 'text' })}
              dataAttrs={{ 'aria-labelledby': `${uid}-${rowId}-kind` }}
            />
          </div>
        {:else}
          <Select
            label="Kind"
            value={field.kind}
            options={kinds}
            onchange={(kind) =>
              reshape(field, {
                kind,
                ...(kind === 'choice' && !field.choices
                  ? { choices: ['Option 1', 'Option 2'] }
                  : {}),
              })}
          />
          {#if field.kind === 'choice'}
            <div class="af-field">
              <Input
                label="Choices, separated by commas"
                value={field.choices?.join(', ') ?? ''}
                oninput={(e) =>
                  patch(field.key, {
                    choices: (e.currentTarget as HTMLInputElement).value
                      .split(',')
                      .map((s) => s.trim()),
                  })}
                dataAttrs={error?.choices
                  ? { 'aria-invalid': 'true', 'aria-describedby': `${errId}-choices` }
                  : {}}
              />
              {#if error?.choices}<p class="af-error" id="{errId}-choices">
                  {error.choices}
                </p>{/if}
            </div>
          {/if}
          <div class="af-choice">
            <span class="af-label" id="{uid}-{rowId}-role">Shows as</span>
            <RadioGroup
              value={field.role}
              options={roles}
              orientation="horizontal"
              onValueChange={(value) => {
                const role = roles.find((r) => r.value === value)?.value;
                if (role) reshape(field, { role });
              }}
              dataAttrs={{ 'aria-labelledby': `${uid}-${rowId}-role` }}
            />
            {#if field.role === 'hidden'}<p class="af-hint">
                The model still writes it, which can improve the answer
              </p>{/if}
          </div>
          <Checkbox
            label="Required"
            checked={field.required}
            onchange={(required) => patch(field.key, { required })}
          />
        {/if}
        <Input
          label="What goes here"
          placeholder="Tell the model what to put here"
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
  .af-add {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
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
    padding: var(--space-1) var(--space-2);
    min-inline-size: 0;
  }
  /* Name, line and actions on one row; below 600px the line drops under the name and the actions stay put. */
  .af-summary {
    display: grid;
    grid-template-columns: 16px minmax(0, max-content) minmax(0, 1fr) auto;
    grid-template-areas: 'grip name line actions';
    align-items: center;
    gap: 0 var(--space-2);
  }
  .af-grip {
    grid-area: grip;
    display: inline-flex;
    color: var(--color-muted);
  }
  .af-grip-handle {
    display: inline-flex;
    cursor: grab;
  }
  .af-name {
    grid-area: name;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .af-line {
    grid-area: line;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .af-actions {
    grid-area: actions;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  @container options (max-width: 600px) {
    .af-summary {
      grid-template-columns: 16px minmax(0, 1fr) auto;
      grid-template-areas:
        'grip name actions'
        '. line line';
    }
  }
  .af-hint,
  .af-error {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .af-error {
    color: var(--color-danger-fg);
  }
  .af-row.af-invalid {
    border-color: var(--color-danger);
  }
  .af-field {
    display: grid;
    gap: var(--space-1);
  }
  /* Input draws its border on the row around the input. */
  .af-field :global(.ega-input-row:has(input[aria-invalid='true'])) {
    border-color: var(--color-danger);
  }
  .af-label {
    font-size: var(--fs-sm);
    font-weight: 500;
  }
  .af-choice {
    display: grid;
    gap: var(--space-1);
  }
  .af-edit {
    display: grid;
    gap: var(--space-3);
    padding-block: var(--space-2);
    padding-inline-start: calc(16px + var(--space-2));
  }
  .af-editor :global(.af-more) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-fg-subtle);
    cursor: pointer;
  }
  .af-editor :global(.af-more:hover),
  .af-editor :global(.af-more[aria-expanded='true']) {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .af-editor :global(.af-more:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  /* :global — bits renders the menu in a portal on <body>. */
  :global(.af-menu) {
    box-sizing: border-box;
    min-inline-size: 160px;
    padding: var(--space-1);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px var(--color-shadow);
    font-family: var(--font-ui);
    line-height: var(--lh-body);
    z-index: 100000;
  }
  :global(.af-menu-item) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 32px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-fg);
    font-size: var(--fs-sm);
    cursor: pointer;
    outline: none;
  }
  :global(.af-menu-item[data-highlighted]) {
    background: var(--color-bg-hover);
  }
  :global(.af-menu-item:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  :global(.af-menu-item[data-disabled]) {
    color: var(--color-fg-disabled);
    cursor: var(--cursor-disabled);
  }
  :global(.af-menu-item.af-menu-danger) {
    color: var(--color-danger-fg);
  }
</style>
