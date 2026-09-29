<script lang="ts">
  import { type Recipe, deserialiseRecipe } from '@/shared/recipes';
  import { TASK_LABELS } from '@/shared/task-prompts';
  import Button from '@/shared/ui/Button.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Textarea from '@/shared/ui/Textarea.svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';

  interface Props {
    onClose: () => void;
    /** Receives the trimmed encoded string; parent persists. */
    onImport: (encoded: string) => Promise<void>;
    /** Fired after a successful import resolves. */
    onSuccess: () => void;
    /** Fired when import throws — parent surfaces toast / log. */
    onFailure: (e: unknown) => void;
  }

  const { onClose, onImport, onSuccess, onFailure }: Props = $props();

  let input = $state('');
  let error = $state<string | null>(null);
  let preview = $state<Recipe | null>(null);
  // Bind the preview to the exact payload the user reviewed. Otherwise, a
  // later textarea edit could import code the user did not preview.
  let previewedEncoded = $state<string | null>(null);
  let importing = $state(false);

  function clearPreview(): void {
    preview = null;
    previewedEncoded = null;
  }

  function handleInput(event: Event): void {
    const currentValue = (event.currentTarget as HTMLTextAreaElement).value.trim();
    if (preview && currentValue !== previewedEncoded) {
      clearPreview();
      error = null;
    }
  }

  function decode(): void {
    error = null;
    clearPreview();
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      error = 'Paste a recipe code first.';
      return;
    }
    const decoded = deserialiseRecipe(trimmed);
    if (!decoded) {
      error =
        'This does not look like a recipe code. Ask your teammate to copy it again with Export.';
      return;
    }
    preview = decoded;
    previewedEncoded = trimmed;
  }

  async function applyPaste(): Promise<void> {
    const recipe = preview;
    const encoded = previewedEncoded;
    if (!recipe || !encoded || importing) return;
    const ok = await confirmDialog({
      title: 'Import recipe',
      body: `Import "${recipe.label}" into your saved recipes?`,
      confirmLabel: 'Import',
    });
    if (!ok) return;
    if (input.trim() !== encoded) {
      clearPreview();
      error = 'Recipe code changed. Preview it again before importing.';
      return;
    }
    importing = true;
    onClose();
    try {
      await onImport(encoded);
      onSuccess();
    } catch (e) {
      onFailure(e);
    } finally {
      importing = false;
    }
  }
</script>

<Dialog open={true} title="Paste shared recipe" {onClose} size="lg">
  {#snippet help()}Paste a recipe code a teammate shared with Export.{/snippet}
  {#snippet actions()}
    <Button variant="secondary" onclick={onClose}>Cancel</Button>
    {#if preview}
      <Button
        variant="primary"
        dataAttrs={{ 'data-ega-recipe-paste-apply': 'true' }}
        disabled={importing}
        onclick={() => void applyPaste()}
      >
        Import
      </Button>
    {:else}
      <Button
        variant="primary"
        dataAttrs={{ 'data-ega-recipe-paste-decode': 'true' }}
        onclick={decode}
      >
        Preview
      </Button>
    {/if}
  {/snippet}
  <Textarea
    bind:value={input}
    rows={4}
    mono
    placeholder="Paste here…"
    oninput={handleInput}
    dataAttrs={{
      'data-ega-recipe-paste-input': 'true',
      'aria-label': 'Recipe code',
    }}
  />
  {#if error}
    <div class="dialog-error" role="alert">{error}</div>
  {/if}
  {#if preview}
    <div class="paste-preview" data-ega-recipe-paste-preview>
      <div class="preview-row">
        <span class="preview-label">Label</span>
        <span class="preview-value">{preview.label}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Task</span>
        <span class="preview-value">{TASK_LABELS[preview.task]}</span>
      </div>
      <div class="preview-row">
        <span class="preview-label">Rules</span>
        <span class="preview-value">{preview.rules?.length ?? 0}</span>
      </div>
      <p class="preview-desc">{preview.description}</p>
    </div>
  {/if}
</Dialog>

<style>
  .dialog-error {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-danger-fg);
  }
  .paste-preview {
    margin-top: var(--space-3);
    padding: var(--space-3);
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .preview-row {
    display: flex;
    gap: var(--space-2);
    font-size: var(--fs-sm);
  }
  .preview-label {
    color: var(--color-muted);
    min-width: 60px;
  }
  .preview-value {
    color: var(--color-fg);
    font-weight: 500;
  }
  .preview-desc {
    margin: var(--space-1) 0 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
</style>
