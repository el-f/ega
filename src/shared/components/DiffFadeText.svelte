<script lang="ts">
  // Carries no <style>: content surfaces only receive styles.css inside their shadow root,
  // so each surface styles .body-diff/.diff-* itself.
  import { diffWords, type DiffOp } from '@/shared/diff-words';

  interface Props {
    /** Settled new text. Caller gates rendering on `text !== diffAgainst`. */
    text: string;
    /** Prior text to diff against. */
    diffAgainst: string;
  }

  const { text, diffAgainst }: Props = $props();

  const diffOps: DiffOp[] = $derived(diffWords(diffAgainst, text));

  let faded = $state(false);
  $effect(() => {
    void diffOps;
    faded = false;
    const t = setTimeout(() => {
      faded = true;
    }, 4000);
    return () => clearTimeout(t);
  });
</script>

<span class="body-diff" class:body-diff-faded={faded} data-ega-diff-fade>
  <!-- Keyed by index: ops are positional, and a kind+text key throws when one word changes twice. -->
  {#each diffOps as op, i (i)}
    {#if op.kind === 'eq'}<span class="diff-eq">{op.text}</span>{:else if op.kind === 'add'}<span
        class="diff-add"
        data-ega-diff="add">{op.text}</span
      >{:else}<span class="diff-del" data-ega-diff="del">{op.text}</span>{/if}
  {/each}
</span>
