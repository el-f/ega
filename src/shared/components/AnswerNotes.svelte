<script lang="ts">
  import type { AnswerNote } from '@/shared/answer/reader';
  import type { Snippet } from 'svelte';
  interface Props {
    notes?: readonly AnswerNote[];
    explain?: string | undefined;
    fallbackLabel?: string;
    renderText?: Snippet<[string]>;
    lang?: string | undefined;
    usedImage?: boolean;
  }
  let {
    notes = [],
    explain,
    fallbackLabel = 'Notes',
    renderText,
    lang,
    usedImage = false,
  }: Props = $props();
  const blocks = $derived(
    notes.length > 0
      ? notes
      : explain
        ? [{ key: 'explain', label: fallbackLabel, text: explain }]
        : [],
  );
</script>

{#each blocks as note (note.key)}
  <div class="answer-notes" data-ega-explain data-ega-note={note.key} dir="auto" {lang}>
    <p class="answer-note-label" lang="en">
      {note.label}{#if usedImage}<span class="answer-note-image"> · from image</span>{/if}
    </p>
    {#if note.items}
      <ul class="answer-note-items">
        {#each note.items as item, i (i)}<li>{item}</li>{/each}
      </ul>
    {:else if note.text}
      <div class="answer-note-text">
        {#if renderText}{@render renderText(note.text)}{:else}{note.text}{/if}
      </div>
    {/if}
  </div>
{/each}

<style>
  .answer-notes {
    margin-block-start: var(--space-2);
    min-block-size: 0;
    overflow-wrap: anywhere;
  }
  .answer-note-label {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--color-muted);
    margin: 0 0 var(--space-2);
  }
  .answer-note-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--color-muted);
    --ega-md-fs: var(--fs-md);
  }
  .answer-note-image {
    font-weight: 400;
  }
  .answer-note-items {
    margin: 0;
    padding-inline-start: var(--space-5);
  }
</style>
