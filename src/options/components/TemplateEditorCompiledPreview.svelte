<script lang="ts">
  import type { Task } from '@/shared/task-prompts';
  import Checkbox from '@/shared/ui/Checkbox.svelte';

  interface Props {
    task: Task;
    previewSys: string;
    previewUsr: string;
    previewExplain: boolean;
    onPreviewExplainChange: (next: boolean) => void;
  }

  const { task, previewSys, previewUsr, previewExplain, onPreviewExplainChange }: Props = $props();
</script>

<details class="compile-preview" data-ega-compile-preview>
  <summary class="preview-heading">
    <span class="preview-chevron" aria-hidden="true"></span>
    <span class="preview-pill" aria-hidden="true">Read-only</span>
    Compiled preview
  </summary>
  {#if task === 'translate' || task === 'explain'}
    <span class="preview-toggle">
      <Checkbox checked={previewExplain} size="sm" onchange={onPreviewExplainChange}>
        Explain mode (drives <code>{`{{explainField}}`}</code> +
        <code>{`{{explainInstr}}`}</code>)
      </Checkbox>
    </span>
  {/if}
  <div class="preview-block">
    <div class="preview-label">System</div>
    <pre class="preview-pre" data-ega-preview-system>{previewSys}</pre>
  </div>
  <div class="preview-block">
    <div class="preview-label">User</div>
    <pre class="preview-pre" data-ega-preview-user>{previewUsr}</pre>
  </div>
</details>

<style>
  .compile-preview {
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    padding: var(--space-2) var(--space-3);
  }
  .compile-preview[open] {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .compile-preview > summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .compile-preview > summary::-webkit-details-marker {
    display: none;
  }
  .preview-chevron {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid var(--color-muted);
    border-bottom: 1.5px solid var(--color-muted);
    transform: rotate(-45deg);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .compile-preview[open] > summary > .preview-chevron {
    transform: rotate(45deg);
  }
  .compile-preview > summary:hover {
    color: var(--color-fg);
  }
  .preview-heading {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .preview-pill {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    color: var(--color-fg-subtle);
    font-size: var(--fs-xs);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .preview-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-fg);
    cursor: pointer;
    user-select: none;
  }
  .preview-toggle code {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    padding: 0 4px;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
    color: var(--color-accent);
  }
  .preview-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .preview-label {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
  }
  .preview-pre {
    margin: 0;
    padding: var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--color-fg);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 14rem;
    overflow: auto;
  }
</style>
