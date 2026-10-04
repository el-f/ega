<script lang="ts">
  import { CHAT_HISTORY_TOKEN_BUDGET } from '@/shared/chat-history';
  import Checkbox from '@/shared/ui/Checkbox.svelte';

  interface Props {
    previewSys: string;
    previewUsr: string;
    sampleText: string;
    /** Set for the prompts Explain also runs, so the preview can show its extra instructions. */
    explain?: { checked: boolean; onChange: (next: boolean) => void } | undefined;
  }

  const { previewSys, previewUsr, sampleText, explain }: Props = $props();

  const historyBudget = CHAT_HISTORY_TOKEN_BUDGET.toLocaleString('en-US');
  let details: HTMLDetailsElement | null = $state(null);

  // Opened at the bottom of a scrolling dialog, the preview would land out of sight.
  function onToggle(): void {
    if (details?.open) details.scrollIntoView({ block: 'nearest' });
  }
</script>

<details class="prompt-preview" data-ega-compile-preview bind:this={details} ontoggle={onToggle}>
  <summary class="preview-summary">
    <span class="preview-chevron" aria-hidden="true"></span>
    Preview what the model receives
  </summary>
  <p class="preview-note">
    With the sample text “{sampleText}” and your current settings. You cannot edit it here.
  </p>
  {#if explain}
    <Checkbox checked={explain.checked} size="sm" onchange={explain.onChange}>
      Preview as Explain (adds its notes instructions)
    </Checkbox>
  {/if}
  <section class="preview-part">
    <h3 class="preview-label">Instructions</h3>
    <pre class="preview-pre" data-ega-preview-system>{previewSys}</pre>
  </section>
  <section class="preview-part" data-ega-preview-history>
    <h3 class="preview-label">Earlier messages</h3>
    <p class="preview-slot">
      For a follow-up sent in the side panel, the most recent earlier messages of the conversation
      go here, up to about {historyBudget} tokens. Tooltip, image and Regenerate requests send none.
    </p>
  </section>
  <section class="preview-part">
    <h3 class="preview-label">Message</h3>
    <pre class="preview-pre" data-ega-preview-user>{previewUsr}</pre>
  </section>
</details>

<style>
  .prompt-preview {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    padding: var(--space-2) var(--space-3);
  }
  .prompt-preview[open] {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
  }
  .preview-summary {
    cursor: pointer;
    list-style: none;
    user-select: none;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-fg);
  }
  .preview-summary::-webkit-details-marker {
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
  .prompt-preview[open] .preview-chevron {
    transform: rotate(45deg);
  }
  .preview-note {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .preview-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .preview-label {
    margin: 0;
    font-size: var(--fs-xs);
    font-weight: 500;
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
  .preview-slot {
    margin: 0;
    padding: var(--space-2);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
</style>
