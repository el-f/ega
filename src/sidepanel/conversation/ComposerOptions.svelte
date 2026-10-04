<script lang="ts">
  import Popover from '@/shared/ui/Popover.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import ContextLevelPicker from '@/shared/components/ContextLevelPicker.svelte';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

  interface Props {
    /** Mirror of Settings.pageContextLevel; writes through onContextLevelChange. */
    pageContextLevel: 'minimal' | 'rich';
    /** Mirror of Settings.contextEnabled. False replaces the level picker with a link to Settings. */
    contextEnabled: boolean;
    /** "Using N earlier messages", or null when no history goes with the next send. */
    historyLabel: string | null;
    /** Whether streaming is enabled for the next send. */
    streaming: boolean;
    onContextLevelChange: (level: 'minimal' | 'rich') => void;
    onToggleStreaming: (next: boolean) => void;
    onOpenOptions: () => void;
  }

  let {
    pageContextLevel,
    contextEnabled,
    historyLabel,
    streaming,
    onContextLevelChange,
    onToggleStreaming,
    onOpenOptions,
  }: Props = $props();

  let anchor = $state<HTMLButtonElement | null>(null);
  let open = $state(false);
</script>

<button
  bind:this={anchor}
  type="button"
  class="ega-composer-options"
  aria-label="Message options"
  aria-haspopup="dialog"
  aria-expanded={open}
  data-tooltip="Page info and live reply"
  data-tooltip-placement="top-end"
  data-ega-composer-options
  onclick={() => (open = !open)}
>
  <SlidersHorizontal size={16} />
</button>

<Popover {open} {anchor} onClose={() => (open = false)} placement="top-end" title="Message options">
  <div class="opts">
    <section class="opt">
      {#if contextEnabled}
        <ContextLevelPicker value={pageContextLevel} onchange={onContextLevelChange} />
      {:else}
        <p class="opt-title">Page info</p>
        <p class="opt-help">
          Page info is off, so only your text is sent.
          <button type="button" class="link" data-ega-ctx-off onclick={onOpenOptions}>
            Turn it on in Settings
          </button>
        </p>
      {/if}
    </section>
    <section class="opt">
      <Checkbox
        label="Show the reply as it is written"
        checked={streaming}
        inputAttrs={{ 'data-ega-streaming-toggle': '' }}
        onchange={onToggleStreaming}
      />
      <p class="opt-help">Applies to every send. Saved in Settings.</p>
    </section>
    {#if historyLabel !== null}
      <p class="opt-help ega-context-label">{historyLabel} with your next message.</p>
    {/if}
  </div>
</Popover>

<style>
  .ega-composer-options {
    flex: 0 0 auto;
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
  }
  .ega-composer-options:hover,
  .ega-composer-options[aria-expanded='true'] {
    color: var(--color-fg);
    background: var(--color-bg-hover);
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: min(280px, 80vw);
    font-size: var(--fs-sm);
  }
  .opt {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .opt-title {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .opt-help {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--color-accent-hover);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
