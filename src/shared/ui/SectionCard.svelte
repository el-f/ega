<script lang="ts">
  import type { Snippet } from 'svelte';
  import { id } from '@/shared/uuid';
  import InfoTip from './InfoTip.svelte';

  interface Props {
    title: string;
    description?: string;
    children: Snippet;
    footer?: Snippet;
    /** Right-aligned actions on the title row; the description still wraps below. */
    headerActions?: Snippet;
    /** An (i) toggletip after the title, for help longer than the one-line description. */
    info?: { label: string; text: string };
  }

  let { title, description, children, footer, headerActions, info }: Props = $props();
  const titleId = id('ega-section');
</script>

<section class="ega-section-card" aria-labelledby={titleId}>
  <header class="ega-section-card-head">
    <div class="ega-section-card-title-row">
      <div class="ega-section-card-title-group">
        <h2 id={titleId} class="ega-section-card-title">{title}</h2>
        {#if info}<InfoTip label={info.label} text={info.text} />{/if}
      </div>
      {#if headerActions}
        <div class="ega-section-card-actions">{@render headerActions()}</div>
      {/if}
    </div>
    {#if description}
      <p class="ega-section-card-desc">{description}</p>
    {/if}
  </header>
  <div class="ega-section-card-body">
    {@render children()}
  </div>
  {#if footer}
    <footer class="ega-section-card-foot">{@render footer()}</footer>
  {/if}
</section>

<style>
  .ega-section-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--card-pad);
    display: flex;
    flex-direction: column;
    gap: var(--row-gap);
    margin-bottom: var(--section-margin-bottom, var(--space-3));
  }
  /* Dark only: --color-bg matches the page, so the card would read as a bare 1px border. */
  :global(:root:not([data-theme='light'])) .ega-section-card,
  :global(:host(:not([data-theme='light']))) .ega-section-card {
    background: var(--color-bg-elevated);
  }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme='dark'])) .ega-section-card,
    :global(:host(:not([data-theme='dark']))) .ega-section-card {
      background: var(--color-bg);
    }
  }
  :global([data-theme='dark']) .ega-section-card,
  :global(:host([data-theme='dark'])) .ega-section-card {
    background: var(--color-bg-elevated);
  }
  .ega-section-card-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ega-section-card-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ega-section-card-title-group {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .ega-section-card-title {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--color-fg);
    line-height: var(--lh-heading);
  }
  .ega-section-card-actions {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .ega-section-card-desc {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .ega-section-card-body {
    display: flex;
    flex-direction: column;
    gap: var(--row-gap);
  }
  .ega-section-card-foot {
    margin-top: var(--space-1);
    padding-top: var(--row-gap);
    border-top: 1px solid var(--color-border-subtle);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
