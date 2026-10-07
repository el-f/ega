<script lang="ts">
  /** Line diff of the stored prompt template against the shipped default. */
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import { diffWords, type DiffOp } from '@/shared/diff-words';

  interface Props {
    userTemplate: { system: string; user: string };
    currentTemplate: { system: string; user: string };
    onClose: () => void;
  }

  let { userTemplate, currentTemplate, onClose }: Props = $props();

  const MARK: Record<DiffOp['kind'], '+' | '-' | ' '> = { eq: ' ', add: '+', del: '-' };

  function diffLines(a: string, b: string): { kind: '+' | '-' | ' '; line: string }[] {
    return diffWords(a, b, 'line').map((op) => ({
      kind: MARK[op.kind],
      line: op.text.replace(/\n$/, ''),
    }));
  }

  const sysDiff = $derived(diffLines(userTemplate.system, currentTemplate.system));
  const usrDiff = $derived(diffLines(userTemplate.user, currentTemplate.user));

  // A binding, because `{'\n'}` in the markup trips svelte/no-useless-mustaches and a raw newline can be collapsed.
  const NL = '\n';
</script>

<!-- diffWords returns no ops past its LCS budget; say so instead of painting an empty pane. -->
{#snippet pane(heading: string, ops: { kind: '+' | '-' | ' '; line: string }[], empty: boolean)}
  <h4>{heading}</h4>
  {#if ops.length === 0 && !empty}
    <p class="diff-capped">Too long to diff line by line.</p>
  {:else}
    <pre class="diff-block">{#each ops as d, i (i)}<span class="diff-line" data-kind={d.kind}
          >{d.kind} {d.line}{NL}</span
        >{/each}</pre>
  {/if}
{/snippet}

<Dialog open={true} title="Template version diff" {onClose} size="lg">
  {#snippet help()}
    <span class="legend remove">−</span> = your line ·
    <span class="legend add">+</span> = current default
  {/snippet}
  {#snippet actions()}
    <Button variant="secondary" onclick={onClose}>Close</Button>
  {/snippet}

  <div data-ega-diff-modal>
    {@render pane('System', sysDiff, userTemplate.system === '' && currentTemplate.system === '')}
    {@render pane('User', usrDiff, userTemplate.user === '' && currentTemplate.user === '')}
  </div>
</Dialog>

<style>
  .legend {
    font-family: var(--font-mono);
    font-weight: 600;
  }
  .legend.add {
    color: var(--color-success-fg);
  }
  .legend.remove {
    color: var(--color-danger);
  }
  h4 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .diff-capped {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .diff-block {
    background: var(--color-bg-sunken);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 28vh;
    overflow: auto;
    margin: 0;
  }
  .diff-line {
    display: inline;
  }
  .diff-line[data-kind='+'] {
    color: var(--color-success-fg);
    background: rgba(0, 200, 0, 0.06);
  }
  .diff-line[data-kind='-'] {
    color: var(--color-danger);
    background: rgba(200, 0, 0, 0.06);
  }
</style>
