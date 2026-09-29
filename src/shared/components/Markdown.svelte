<script lang="ts">
  // `marked` and DOMPurify load lazily so the shell stays light until the first turn;
  // raw text renders in a `<pre>` meanwhile. Sanitizer config: markdown-loader.ts.

  import { loadMarkdownRenderer } from './markdown-loader';
  import { debugCatch } from '@/shared/logger';

  interface Props {
    text: string;
    /** Optional class hook for surface-specific styling overrides. */
    class?: string;
  }

  let { text, class: cls = '' }: Props = $props();

  let html = $state<string>('');
  let ready = $state(false);

  // loadMarkdownRenderer is idempotent, and `cancelled` stops a late resolve writing into a torn-down component.
  let mountedToken = 0;
  $effect(() => {
    const t = text;
    const token = ++mountedToken;
    let cancelled = false;
    loadMarkdownRenderer()
      .then((render) => {
        if (cancelled) return;
        if (token !== mountedToken) return;
        html = render(t);
        ready = true;
      })
      .catch((e: unknown) => debugCatch(e, 'shared.components.Markdown.load'));
    return () => {
      cancelled = true;
    };
  });
</script>

<!-- dir=auto reads direction from the first strong character, so an RTL reply aligns with the text, not the page. -->
<div class="ega-md {cls}" dir="auto">
  {#if ready}
    <!-- DOMPurify has already sanitized this HTML. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  {:else}
    <pre class="ega-md-fallback">{text}</pre>
  {/if}
</div>

<style>
  .ega-md {
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-fg);
    /* Word-break to wrap long URLs / tokens so the bubble doesn't blow
       past its container width on terminal-like content. */
    overflow-wrap: anywhere;
  }
  .ega-md :global(p) {
    margin: 0 0 var(--space-2);
  }
  .ega-md :global(p:last-child) {
    margin-bottom: 0;
  }
  .ega-md :global(pre) {
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    overflow-x: auto;
    font-size: var(--fs-xs);
  }
  .ega-md :global(code) {
    background: var(--color-bg-sunken);
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    font-size: 0.95em;
  }
  .ega-md :global(pre code) {
    background: transparent;
    padding: 0;
  }
  .ega-md :global(blockquote) {
    border-inline-start: 3px solid var(--color-border);
    padding: 0 var(--space-2);
    margin: 0 0 var(--space-2);
    color: var(--color-muted);
  }
  .ega-md :global(ul),
  .ega-md :global(ol) {
    margin: 0 0 var(--space-2);
    padding-inline-start: var(--space-4);
  }
  .ega-md :global(table) {
    border-collapse: collapse;
    margin: 0 0 var(--space-2);
    font-size: var(--fs-xs);
  }
  .ega-md :global(th),
  .ega-md :global(td) {
    border: 1px solid var(--color-border);
    padding: 2px var(--space-1);
  }
  .ega-md :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-sm);
  }
  .ega-md :global(.ega-md-img-blocked) {
    display: inline;
    font-style: italic;
    color: var(--color-muted);
  }
  .ega-md :global(.ega-md-link-host) {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
  .ega-md :global(a) {
    color: var(--color-accent);
  }
  .ega-md :global(h1),
  .ega-md :global(h2),
  .ega-md :global(h3),
  .ega-md :global(h4),
  .ega-md :global(h5),
  .ega-md :global(h6) {
    /* Reduced size scale relative to chat — these aren't page headings. */
    font-size: var(--fs-md);
    margin: var(--space-2) 0 var(--space-1);
    font-weight: 600;
  }
  /* Same words the rendered pass shows, so it must not read as secondary text while the chunk loads. */
  .ega-md-fallback {
    margin: 0;
    white-space: pre-wrap;
    font: inherit;
  }
</style>
