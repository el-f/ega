<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Layout for popup, side panel and options: optional header and footer, body fills the rest. */
  interface Props {
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }

  let { children, header, footer }: Props = $props();
</script>

<div class="ega-app-shell" data-ega-app-shell>
  {#if header}
    <header class="ega-app-shell-header">{@render header()}</header>
  {/if}
  <main class="ega-app-shell-body">{@render children()}</main>
  {#if footer}
    <footer class="ega-app-shell-footer">{@render footer()}</footer>
  {/if}
</div>

<style>
  .ega-app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .ega-app-shell-header {
    padding: var(--space-2) var(--card-pad);
    border-bottom: 1px solid var(--color-border-subtle);
    flex: 0 0 auto;
  }
  .ega-app-shell-body {
    padding: var(--card-pad);
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .ega-app-shell-footer {
    padding: var(--space-2) var(--card-pad);
    border-top: 1px solid var(--color-border-subtle);
    flex: 0 0 auto;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
</style>
