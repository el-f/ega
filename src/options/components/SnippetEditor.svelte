<script lang="ts">
  import Button from '@/shared/ui/Button.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import EmptyState from '@/shared/components/EmptyState.svelte';
  import Code2 from '@lucide/svelte/icons/code-2';
  import { confirmDialog } from '@/shared/components/confirmDialog';

  interface Props {
    snippets: Record<string, string>;
    onChange: (next: Record<string, string>) => void | Promise<void>;
  }

  let { snippets, onChange }: Props = $props();

  const NAME_RE = /^\w+$/;
  const BODY_MAX = 8192;

  const entries = $derived(Object.entries(snippets).sort(([a], [b]) => a.localeCompare(b)));

  let renaming = $state<{ from: string } | null>(null);
  let renameInput = $state<string>('');
  let renameError = $state<string>('');

  function nextDefaultName(): string {
    let i = 1;
    while (Object.hasOwn(snippets, `snippet${i}`)) i += 1;
    return `snippet${i}`;
  }

  function validateName(name: string, exclude?: string): string {
    if (name.length === 0) return 'Name is required.';
    if (!NAME_RE.test(name)) return 'Use only letters, digits and underscores.';
    if (name.length > 64) return 'Name is too long (max 64 characters).';
    if (Object.hasOwn(snippets, name) && name !== exclude) return 'That name is already in use.';
    return '';
  }

  async function handleAdd(): Promise<void> {
    const name = nextDefaultName();
    await onChange({ ...snippets, [name]: '' });
  }

  async function handleBodyInput(name: string, e: Event): Promise<void> {
    const next = (e.target as HTMLTextAreaElement).value;
    const capped = next.length > BODY_MAX ? next.slice(0, BODY_MAX) : next;
    await onChange({ ...snippets, [name]: capped });
  }

  async function handleDelete(name: string): Promise<void> {
    const ok = await confirmDialog({
      title: 'Delete snippet',
      body: `Delete "@@${name}@@"? Templates that use it will insert nothing there.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const next = { ...snippets };
    delete next[name];
    await onChange(next);
  }

  function openRename(from: string): void {
    renaming = { from };
    renameInput = from;
    renameError = '';
  }
  function closeRename(): void {
    renaming = null;
    renameError = '';
  }
  async function submitRename(): Promise<void> {
    if (!renaming) return;
    const trimmed = renameInput.trim();
    const err = validateName(trimmed, renaming.from);
    if (err) {
      renameError = err;
      return;
    }
    const from = renaming.from;
    closeRename();
    if (trimmed === from) return;
    const body = snippets[from] ?? '';
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(snippets)) {
      if (k === from) continue;
      next[k] = v;
    }
    next[trimmed] = body;
    await onChange(next);
  }
</script>

<div class="snippet-editor" data-ega-snippet-editor>
  <div class="head">
    <Button variant="primary" size="sm" onclick={() => void handleAdd()}>+ New snippet</Button>
  </div>

  {#if entries.length === 0}
    <EmptyState
      icon={Code2}
      title="No snippets yet"
      description="Snippets are reusable text blocks. Reference them in any template via @@name@@."
    />
  {:else}
    <ul class="list" role="list">
      {#each entries as [name, body] (name)}
        <li class="row" data-ega-snippet-row data-ega-snippet-name={name}>
          <div class="row-head">
            <code class="name">@@{name}@@</code>
            <div class="row-actions">
              <Button variant="secondary" size="sm" onclick={() => openRename(name)}>
                Edit name
              </Button>
              <Button variant="danger" size="sm" onclick={() => void handleDelete(name)}>
                Delete
              </Button>
            </div>
          </div>
          <textarea
            class="body"
            dir="auto"
            data-ega-snippet-body
            aria-label={`Snippet body for ${name}`}
            value={body}
            maxlength={BODY_MAX}
            rows={4}
            oninput={(e) => void handleBodyInput(name, e)}></textarea>
          <div class="meta">{body.length} / {BODY_MAX}</div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if renaming}
  <Dialog open={true} title="Rename snippet" onClose={closeRename} size="sm">
    {#snippet actions()}
      <Button variant="secondary" onclick={closeRename}>Cancel</Button>
      <Button variant="primary" onclick={() => void submitRename()}>Rename</Button>
    {/snippet}
    <label class="dialog-label" for="snippet-rename-input">New name</label>
    <input
      id="snippet-rename-input"
      type="text"
      dir="auto"
      class="dialog-input"
      bind:value={renameInput}
      data-ega-snippet-rename-input
      aria-invalid={renameError ? 'true' : undefined}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void submitRename();
        }
      }}
    />
    {#if renameError}
      <div class="dialog-error" role="alert">{renameError}</div>
    {/if}
  </Dialog>
{/if}

<style>
  .snippet-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .head {
    display: flex;
    justify-content: flex-start;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .row-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .name {
    flex: 1 1 auto;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
  }
  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .body {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    resize: vertical;
  }
  .body:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .meta {
    align-self: flex-end;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .dialog-label {
    display: block;
    font-size: var(--fs-sm);
    margin-bottom: var(--space-2);
    color: var(--color-muted);
  }
  .dialog-input {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-family: var(--font-mono);
  }
  .dialog-input:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-bg-soft);
  }
  .dialog-input[aria-invalid='true'] {
    border-color: var(--color-danger);
  }
  .dialog-error {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-danger-fg);
  }
</style>
