<script lang="ts">
  interface Props {
    src: string;
    /** Description for assistive tech. Defaults to "Image preview". */
    alt?: string;
  }

  let { src, alt = 'Image preview' }: Props = $props();

  const COLLAPSED_HEIGHT = '120px';

  let expanded = $state(false);
  // The collapsed cap is the ceiling, so reserving it can only shrink on load — never push later content down.
  let loaded = $state(false);

  function toggle(): void {
    expanded = !expanded;
  }
</script>

<button
  type="button"
  class="ega-imgprev"
  class:expanded
  aria-expanded={expanded}
  aria-label={expanded ? 'Collapse image' : 'Expand image'}
  onclick={toggle}
  style:min-height={loaded ? undefined : COLLAPSED_HEIGHT}
>
  <img
    {src}
    {alt}
    loading="lazy"
    style:max-height={expanded ? 'none' : COLLAPSED_HEIGHT}
    onload={() => (loaded = true)}
    onerror={() => (loaded = true)}
  />
</button>

<style>
  .ega-imgprev {
    display: inline-block;
    padding: 0;
    margin: 0;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: zoom-in;
    overflow: hidden;
    /* Reset native button look. */
    color: inherit;
    font: inherit;
    text-align: left;
    line-height: 0;
  }
  .ega-imgprev.expanded {
    cursor: zoom-out;
  }
  .ega-imgprev:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-imgprev img {
    display: block;
    max-width: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }
</style>
