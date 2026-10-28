<script lang="ts">
  /** What a task's reply holds, above its prompt: the same title, (i) and rows in the built-in and custom dialogs. */
  import type { Snippet } from 'svelte';
  import InfoTip from '@/shared/ui/InfoTip.svelte';
  import type { ReplyRow } from '@/shared/answer/describe';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    /** Read-only parts; empty while a field editor lists them instead. */
    rows?: readonly ReplyRow[];
    /** Above the parts: a custom task's reply settings. */
    children?: Snippet;
    /** Under the parts: a custom task's example reply. */
    after?: Snippet;
  }

  const { rows = [], children, after }: Props = $props();
  const uid = makeId('ega-reply');
</script>

<section class="reply" aria-labelledby="{uid}-title" data-ega-reply-section>
  <div class="reply-head">
    <h3 class="reply-title" id="{uid}-title">Reply</h3>
    <InfoTip
      label="About the reply"
      text="Ega asks the model for these parts and shows them in the reply. Preview shows the exact text sent."
    />
  </div>
  {@render children?.()}
  {#if rows.length > 0}
    <dl class="reply-rows">
      {#each rows as row (row.key)}
        <div class="reply-row">
          <dt>{row.label}</dt>
          <dd>{row.line}</dd>
        </div>
      {/each}
    </dl>
  {/if}
  {@render after?.()}
</section>

<style>
  .reply {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .reply-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .reply-title {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .reply-rows {
    margin: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-1) var(--space-4);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .reply-row {
    display: contents;
  }
  .reply-row dt {
    color: var(--color-fg);
  }
  .reply-row dd {
    margin: 0;
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }
</style>
