<script lang="ts" module>
  import type { Task } from '@/shared/task-prompts';

  export interface TemplatePillPreviewProps {
    task: Task;
    system: string;
    user: string;
    /** Slot name → sample value. Empty / missing values render the
     *  pill but the tooltip shows "empty in current context". */
    resolvedValues: Record<string, string>;
  }

  interface Chunk {
    readonly kind: 'text' | 'slot' | 'snippet';
    readonly value: string;
    readonly missing?: boolean;
    readonly builtIn?: boolean;
  }
</script>

<script lang="ts">
  import {
    SLOT_RE,
    isBuiltInSlot,
    requiredMissingSlots,
    SLOT_REGISTRY,
  } from '@/shared/slot-registry';
  import { SNIPPET_RE } from '@/shared/snippets';
  import Tooltip from '@/shared/ui/Tooltip.svelte';

  const { task, system, user, resolvedValues }: TemplatePillPreviewProps = $props();

  const requiredMissing = $derived(requiredMissingSlots(task, user));

  function tokenize(text: string, missing: readonly string[]): readonly Chunk[] {
    const hits: { start: number; end: number; chunk: Chunk }[] = [];
    for (const m of text.matchAll(SLOT_RE)) {
      const name = m[1] ?? '';
      const builtIn = isBuiltInSlot(name);
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        chunk: { kind: 'slot', value: name, missing: missing.includes(name), builtIn },
      });
    }
    for (const m of text.matchAll(SNIPPET_RE)) {
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        chunk: { kind: 'snippet', value: m[1] ?? '' },
      });
    }
    hits.sort((a, b) => a.start - b.start);
    const chunks: Chunk[] = [];
    let cursor = 0;
    for (const h of hits) {
      if (h.start > cursor) {
        chunks.push({ kind: 'text', value: text.slice(cursor, h.start) });
      }
      chunks.push(h.chunk);
      cursor = h.end;
    }
    if (cursor < text.length) {
      chunks.push({ kind: 'text', value: text.slice(cursor) });
    }
    return chunks;
  }

  const sysChunks = $derived(tokenize(system, requiredMissing));
  const usrChunks = $derived(tokenize(user, requiredMissing));

  function tooltipBody(name: string, builtIn: boolean): string {
    const value = resolvedValues[name];
    if (typeof value === 'string' && value.length > 0) {
      return value.length > 200 ? `${value.slice(0, 197)}…` : value;
    }
    if (builtIn) {
      const spec = (SLOT_REGISTRY as Record<string, { description?: string }>)[name];
      if (spec?.description) return `${spec.description}\n\n(empty in current context)`;
    }
    return builtIn ? `{{${name}}}` : `{{${name}}} (custom)`;
  }
</script>

{#snippet chunkRun(chunks: readonly Chunk[])}
  {#each chunks as chunk, i (i)}
    {#if chunk.kind === 'text'}<span>{chunk.value}</span>{:else if chunk.kind === 'slot'}<Tooltip
        text={tooltipBody(chunk.value, chunk.builtIn ?? false)}
      >
        {#snippet trigger()}
          <span
            class="tpl-slot-pill"
            class:custom={!chunk.builtIn}
            class:tpl-required-missing={chunk.missing}
            data-slot={chunk.value}>{chunk.value}</span
          >
        {/snippet}
      </Tooltip>{:else}<span class="tpl-snippet-pill" data-snippet={chunk.value}
        >@{chunk.value}</span
      >{/if}
  {/each}
{/snippet}

<div class="tpl-pill-preview" data-ega-template-pill-preview>
  <div class="block" data-ega-template-pill-system>
    <div class="block-label">System (preview)</div>
    <div class="block-body">{@render chunkRun(sysChunks)}</div>
  </div>

  <div class="block" data-ega-template-pill-user>
    <div class="block-label">User (preview)</div>
    <div class="block-body">{@render chunkRun(usrChunks)}</div>
  </div>
</div>

<style>
  .tpl-pill-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .block {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    padding: var(--space-2) var(--space-3);
  }
  .block-label {
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
    margin-bottom: var(--space-1);
  }
  .block-body {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-fg);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tpl-slot-pill {
    display: inline-block;
    padding: 1px var(--space-2);
    margin: 0 2px;
    border-radius: var(--radius-pill);
    background: var(--color-accent-bg-soft);
    color: var(--color-accent);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 500;
    border: 1px solid var(--color-accent);
    line-height: 1.4;
    white-space: nowrap;
    vertical-align: baseline;
  }
  .tpl-slot-pill.custom {
    background: var(--color-bg-elevated);
    color: var(--color-fg-subtle);
    border-color: var(--color-border);
  }
  .tpl-slot-pill.tpl-required-missing {
    border-color: var(--color-danger);
    color: var(--color-danger);
    background: var(--color-danger-bg-soft);
  }
  .tpl-snippet-pill {
    display: inline-block;
    padding: 1px var(--space-2);
    margin: 0 2px;
    border-radius: var(--radius-pill);
    background: var(--color-success-bg-soft);
    color: var(--color-success-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 500;
    border: 1px solid var(--color-success);
    line-height: 1.4;
    white-space: nowrap;
    vertical-align: baseline;
  }
</style>
