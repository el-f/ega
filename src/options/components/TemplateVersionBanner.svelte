<script lang="ts">
  /** Inside the Translate prompt: a newer built-in prompt exists and the user's is edited. */
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    userVersion: number;
    currentVersion: number;
    acknowledgedVersion: number | undefined;
    onKeepMine: () => void;
    onShowDiff: () => void;
    onUseNew: () => void;
  }

  let {
    userVersion,
    currentVersion,
    acknowledgedVersion,
    onKeepMine,
    onShowDiff,
    onUseNew,
  }: Props = $props();

  const show = $derived(
    userVersion < currentVersion && (acknowledgedVersion ?? 0) < currentVersion,
  );
</script>

{#if show}
  <div class="tpl-version" data-ega-tpl-version-banner>
    <p class="tpl-version-msg">A newer built-in Translate prompt is available</p>
    <div class="tpl-version-actions">
      <Button
        variant="secondary"
        dataAttrs={{ 'data-ega-tpl-show-diff': true }}
        onclick={onShowDiff}
      >
        Show changes
      </Button>
      <Button variant="secondary" dataAttrs={{ 'data-ega-tpl-overwrite': true }} onclick={onUseNew}>
        Use the new prompt
      </Button>
      <Button variant="ghost" dataAttrs={{ 'data-ega-tpl-keep-mine': true }} onclick={onKeepMine}>
        Keep mine
      </Button>
    </div>
  </div>
{/if}

<style>
  .tpl-version {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }
  .tpl-version-msg {
    margin: 0;
    flex: 1 1 16rem;
    font-size: var(--fs-base);
    color: var(--color-fg);
  }
  .tpl-version-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
