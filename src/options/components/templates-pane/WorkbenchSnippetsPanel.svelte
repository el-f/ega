<script lang="ts">
  import type { Settings } from '@/shared/types';
  import SnippetEditor from '@/options/components/SnippetEditor.svelte';
  import type { TemplatesHandlers } from '@/options/templates-handlers';

  interface Props {
    s: Settings;
    /** Storage-write handlers, passed whole from the parent tab. */
    handlers: TemplatesHandlers;
  }

  const { s, handlers }: Props = $props();
</script>

<p class="chip-desc">
  Reusable text blocks. Reference from any template via <code>@@name@@</code>. Ega inserts snippets
  before it fills in variables.
</p>
<SnippetEditor snippets={s.advanced.snippets ?? {}} onChange={handlers.setSnippets} />

<style>
  .chip-desc {
    margin: 0;
    color: var(--color-fg-subtle);
    font-size: var(--fs-sm);
  }
</style>
