<script lang="ts" module>
  // Options-only. The popup and side panel surface the same state on ActiveBackendChip.
  export type StatusKind = 'needs-key' | 'onboarding';
</script>

<script lang="ts">
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import OnboardingBanner from './OnboardingBanner.svelte';

  interface Props {
    kind: StatusKind | null;
    onChooseGemini?: () => void;
    onDismissOnboarding?: () => void;
    onJumpToBackends?: () => void;
  }

  const { kind, onChooseGemini, onDismissOnboarding, onJumpToBackends }: Props = $props();

  const isEmpty = $derived(
    kind === null || (kind === 'onboarding' && (!onChooseGemini || !onDismissOnboarding)),
  );
</script>

<div class="status-bar-slot" data-ega-status-bar-slot data-empty={isEmpty ? 'true' : undefined}>
  {#if kind === 'needs-key'}
    <div class="status-bar status-needs-key" role="status" data-ega-status-bar="needs-key">
      <span class="status-icon" aria-hidden="true">
        <AlertTriangle size={16} strokeWidth={1.75} />
      </span>
      <span class="status-body">
        No backend configured — add an API key, or set up a local Ollama or native host.
      </span>
      {#if onJumpToBackends}
        <button
          type="button"
          class="status-cta"
          data-ega-status-jump-backends
          onclick={onJumpToBackends}
        >
          Go to Backends
        </button>
      {/if}
    </div>
  {:else if kind === 'onboarding' && onChooseGemini && onDismissOnboarding}
    <div data-ega-status-bar="onboarding">
      <OnboardingBanner {onChooseGemini} onDismiss={onDismissOnboarding} />
    </div>
  {/if}
</div>

<style>
  .status-bar-slot {
    overflow: hidden;
    transition:
      max-height var(--motion-normal) var(--ease-out),
      opacity var(--motion-normal) var(--ease-out);
    max-height: 16rem;
    opacity: 1;
  }
  .status-bar-slot[data-empty='true'] {
    max-height: 0;
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .status-bar-slot {
      transition: opacity var(--motion-fast) var(--ease-out);
    }
    .status-bar-slot[data-empty='true'] {
      max-height: 0;
    }
  }
  .status-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-warning-border);
    border-radius: var(--radius-md);
    background: var(--color-warning-bg-deep);
    color: var(--color-warning-fg);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }
  .status-icon {
    display: inline-flex;
    flex: 0 0 auto;
  }
  .status-body {
    flex: 1 1 auto;
  }
  .status-cta {
    flex: 0 0 auto;
    padding: var(--space-1) var(--space-2);
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .status-cta:hover,
  .status-cta:focus-visible {
    background: var(--color-warning-bg-soft);
    outline: none;
  }
</style>
