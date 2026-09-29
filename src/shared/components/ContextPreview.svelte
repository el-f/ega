<script lang="ts">
  import type { PageContext } from '@/shared/types';
  import { humanizeContext } from './humanizeContext';

  interface Props {
    /** null when nothing is sent; the panel still renders so the user can see that. */
    context: PageContext | null | undefined;
    /** Visual variant. 'tooltip' = compact footer style; 'panel' = full
     *  side-panel/popup style with a heavier header. Defaults to 'panel'. */
    variant?: 'tooltip' | 'panel';
    /** Bind it to let the parent own the toggle; passed one-way it only sets the first state. */
    open?: boolean;
    /** Hide the built-in Show/Hide button when the parent renders its own; pair with bind:open. */
    hideToggle?: boolean;
  }

  let { context, variant = 'panel', open = $bindable(false), hideToggle = false }: Props = $props();

  let showRaw = $state<boolean>(false);

  const entries = $derived(context ? humanizeContext(context) : []);
  const isEmpty = $derived(entries.length === 0);
  const rawJson = $derived.by(() => {
    if (!context || Object.keys(context).length === 0) return '(empty)';
    try {
      return JSON.stringify(context, null, 2);
    } catch {
      return '(unserializable)';
    }
  });

  function toggle(): void {
    open = !open;
  }
  function toggleRaw(): void {
    showRaw = !showRaw;
  }
</script>

<div
  class="ega-ctx-preview"
  class:ega-ctx-tooltip={variant === 'tooltip'}
  data-ega-context-preview
  data-variant={variant}
>
  {#if !hideToggle}
    <button
      type="button"
      class="ega-ctx-toggle"
      aria-expanded={open}
      onclick={toggle}
      data-ega-context-toggle
    >
      {open ? 'Hide what was sent' : 'Show what was sent'}
    </button>
  {/if}

  {#if open}
    {#if isEmpty}
      <p class="ega-ctx-empty" data-ega-context-empty>No page context was sent.</p>
    {:else if showRaw}
      <pre class="ega-ctx-raw" data-ega-context-json>{rawJson}</pre>
    {:else}
      <dl class="ega-ctx-list" data-ega-context-list>
        {#each entries as entry (entry.label)}
          <dt>{entry.label}</dt>
          <dd class:truncated={entry.truncated}>{entry.value}</dd>
        {/each}
      </dl>
    {/if}

    {#if !isEmpty}
      <button
        type="button"
        class="ega-ctx-raw-toggle"
        onclick={toggleRaw}
        data-ega-context-raw-toggle
      >
        {showRaw ? 'Show as list' : 'Show raw JSON'}
      </button>
    {/if}
  {/if}
</div>

<style>
  .ega-ctx-preview {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: inherit;
  }
  .ega-ctx-toggle,
  .ega-ctx-raw-toggle {
    background: transparent;
    color: inherit;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    opacity: 0.85;
    padding: 2px var(--space-2);
    font-size: var(--fs-xs);
    cursor: pointer;
  }
  .ega-ctx-toggle:hover,
  .ega-ctx-raw-toggle:hover {
    opacity: 1;
  }
  .ega-ctx-raw-toggle {
    margin-top: var(--space-1);
  }
  .ega-ctx-list {
    margin: var(--space-2) 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px var(--space-2);
    /* min-width:0 plus overflow-wrap:anywhere, or a long URL forces the tooltip past its max-width. */
    min-width: 0;
  }
  .ega-ctx-list dt {
    font-weight: 600;
    color: var(--color-muted);
    min-width: 0;
  }
  .ega-ctx-list dd {
    margin: 0;
    font-family: var(--font-mono);
    word-break: break-word;
    white-space: pre-wrap;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ega-ctx-list dd.truncated::after {
    content: ' (truncated)';
    color: var(--color-muted);
    font-family: var(--font-ui);
    font-style: italic;
    font-size: 0.9em;
  }
  .ega-ctx-raw {
    margin: var(--space-2) 0;
    padding: var(--space-2);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    max-height: 260px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }
  .ega-ctx-empty {
    margin: var(--space-2) 0;
    color: var(--color-muted);
  }
  .ega-ctx-preview.ega-ctx-tooltip .ega-ctx-toggle,
  .ega-ctx-preview.ega-ctx-tooltip .ega-ctx-raw-toggle {
    font-size: var(--fs-xs);
    box-sizing: border-box;
    min-height: 24px;
    padding: var(--space-1);
  }
  .ega-ctx-preview.ega-ctx-tooltip .ega-ctx-raw {
    max-height: 160px;
    font-size: var(--fs-xs);
  }
  .ega-ctx-preview.ega-ctx-tooltip .ega-ctx-list {
    font-size: var(--fs-xs);
    /* Stacked inside the tooltip: a side-by-side max-content column pushes the tooltip past its max-width. */
    grid-template-columns: 1fr;
    gap: 4px var(--space-1);
  }
  .ega-ctx-preview.ega-ctx-tooltip .ega-ctx-list dt {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: var(--fs-xs);
    margin-top: 2px;
  }
</style>
