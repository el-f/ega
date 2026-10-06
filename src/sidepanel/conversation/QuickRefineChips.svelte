<script lang="ts">
  // Quick-refine chips under the Side Panel result. A refinement is request-scoped — nothing is persisted.
  import { toastStore } from '@/shared/components/toastStore';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';

  interface Props {
    /** Returns false when the refine bails — another request is in flight, or there is no target turn. */
    onRefine: (args: {
      refinementBody: string;
      refinementLabel?: string;
    }) => boolean | Promise<boolean>;
    /** True while another turn is streaming; every refine would bail. */
    inflight?: boolean;
    /** The row's id, so the button that opens it can point at it with aria-controls. */
    id?: string;
  }

  const { onRefine, inflight = false, id }: Props = $props();

  let refineOpen = $state(false);
  let refineText = $state('');
  let busy = $state(false);
  /** Chip currently in flight; null when idle. Drives the per-chip spinner. */
  let busyKind = $state<ChipKind | null>(null);

  type ChipKind = 'shorter' | 'less-formal' | 'keep-slang';

  // Stored on variants and matched by variantIdxForTarget, so a wording or spelling change orphans old variants.
  const CHIP_BODY: Record<ChipKind, string> = {
    shorter: 'Make outputs shorter.',
    'less-formal': 'Keep outputs less formal than the source.',
    'keep-slang': 'Preserve slang and style markers verbatim — do not normalise.',
  };

  const CHIP_LABEL: Record<ChipKind, string> = {
    shorter: 'Shorter',
    'less-formal': 'Less formal',
    'keep-slang': 'Keep slang',
  };

  async function applyChip(kind: ChipKind): Promise<void> {
    if (busy) return;
    busy = true;
    busyKind = kind;
    try {
      // The 2/2 variant counter and the shimmer are the feedback; a success toast fires before the answer exists.
      const ok = await onRefine({
        refinementBody: CHIP_BODY[kind],
        refinementLabel: CHIP_LABEL[kind],
      });
      if (!ok) {
        toastStore.push({ message: 'Wait for the current reply to finish.', variant: 'warning' });
      }
    } catch {
      toastStore.push({ message: 'Could not refine. Try again.', variant: 'danger' });
    } finally {
      busy = false;
      busyKind = null;
    }
  }

  async function applyInline(): Promise<void> {
    const body = refineText.trim();
    if (body.length === 0 || busy) return;
    busy = true;
    try {
      const ok = await onRefine({ refinementBody: body });
      if (ok) {
        refineText = '';
        refineOpen = false;
      } else {
        toastStore.push({ message: 'Wait for the current reply to finish.', variant: 'warning' });
      }
    } catch {
      toastStore.push({ message: 'Could not refine. Try again.', variant: 'danger' });
    } finally {
      busy = false;
    }
  }

  function onInlineKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void applyInline();
    }
  }
</script>

<div class="quick-refine" {id} data-ega-quick-refine>
  <div
    class="chip-row"
    role="group"
    aria-label={inflight ? 'Quick refine — wait for this reply to finish' : 'Quick refine'}
  >
    {#each ['shorter', 'less-formal', 'keep-slang'] as const as kind (kind)}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || inflight}
        loading={busyKind === kind}
        dataAttrs={{ 'data-ega-refine-chip': kind }}
        onclick={() => void applyChip(kind)}
      >
        {CHIP_LABEL[kind]}
      </Button>
    {/each}
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={Sparkles}
      extraClass="refine-toggle"
      disabled={inflight}
      dataAttrs={{
        'data-ega-refine-chip': 'refine',
        'aria-expanded': refineOpen ? 'true' : 'false',
        'aria-controls': 'quick-refine-input',
      }}
      onclick={() => (refineOpen = !refineOpen)}
    >
      Refine
    </Button>
  </div>
  {#if refineOpen}
    <div id="quick-refine-input" class="refine-input">
      <div class="refine-input-grow">
        <Input
          bind:value={refineText}
          onkeydown={onInlineKeydown}
          placeholder="Tell Ega what to change…"
          disabled={busy}
          dataAttrs={{
            'data-ega-refine-text': 'true',
            'aria-label': 'Describe a refinement for this response',
            // A refinement is typed in the user's own language, so it needs its own bidi direction.
            dir: 'auto',
          }}
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        disabled={refineText.trim().length === 0}
        dataAttrs={{ 'data-ega-refine-apply': 'true' }}
        onclick={() => void applyInline()}
      >
        Apply
      </Button>
    </div>
  {/if}
</div>

<style>
  .quick-refine {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  /* The ghost variant's border is transparent at rest, so the chips read as static text without this. */
  .chip-row :global(.ega-btn) {
    background: var(--color-bg-sunken);
    border-color: var(--color-border-subtle);
  }
  /* Refine shares its chrome with the other chips, so the open state needs an accent fill to stand out. */
  .chip-row :global(.ega-btn.refine-toggle[aria-expanded='true']) {
    background: var(--color-accent-bg-soft);
    /* accent lands under 4.5:1 on the soft accent tint; accent-hover clears it in both themes. */
    color: var(--color-accent-hover);
    border-color: var(--color-accent);
    animation: ega-refine-open-pulse var(--motion-pulse) ease-out;
  }
  @keyframes ega-refine-open-pulse {
    0% {
      box-shadow: 0 0 0 0 var(--color-accent-bg-soft);
    }
    100% {
      box-shadow: 0 0 0 6px transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip-row :global(.ega-btn.refine-toggle[aria-expanded='true']) {
      animation: none;
    }
  }
  /* Staggered mount: the per-child delays below spread the fade-in across the row. */
  .chip-row :global(.ega-btn) {
    animation: ega-chip-mount var(--motion-base) var(--ease-out) both;
  }
  .chip-row :global(.ega-btn:nth-child(1)) {
    animation-delay: 0ms;
  }
  .chip-row :global(.ega-btn:nth-child(2)) {
    animation-delay: 40ms;
  }
  .chip-row :global(.ega-btn:nth-child(3)) {
    animation-delay: 80ms;
  }
  .chip-row :global(.ega-btn:nth-child(4)) {
    animation-delay: 120ms;
  }
  @keyframes ega-chip-mount {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip-row :global(.ega-btn) {
      animation: none;
    }
  }
  .refine-input {
    display: flex;
    gap: var(--space-2);
    align-items: stretch;
    padding-top: var(--space-2);
  }
  .refine-input-grow {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
