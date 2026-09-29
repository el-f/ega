<script lang="ts">
  interface Props {
    userVersion: number;
    currentVersion: number;
    acknowledgedVersion: number | undefined;
    onKeepMine: () => void;
    onShowDiff: () => void;
    onOverwrite: () => void;
  }

  let {
    userVersion,
    currentVersion,
    acknowledgedVersion,
    onKeepMine,
    onShowDiff,
    onOverwrite,
  }: Props = $props();

  const show = $derived(
    userVersion < currentVersion && (acknowledgedVersion ?? 0) < currentVersion,
  );
</script>

{#if show}
  <div class="tpl-version-banner" role="status" aria-live="polite" data-ega-tpl-version-banner>
    <p class="banner-msg">
      <strong>Your prompt template is from version {userVersion}.</strong> Current is
      {currentVersion}. The shipped wording has changed.
    </p>
    <div class="banner-actions">
      <button type="button" data-ega-tpl-keep-mine onclick={onKeepMine}>Keep mine</button>
      <button type="button" data-ega-tpl-show-diff onclick={onShowDiff}>Show diff</button>
      <button type="button" class="primary" data-ega-tpl-overwrite onclick={onOverwrite}>
        Overwrite with new default
      </button>
    </div>
  </div>
{/if}

<style>
  .tpl-version-banner {
    border: 1px solid var(--color-accent);
    background: var(--color-bg-elevated);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .banner-msg {
    margin: 0;
    color: var(--color-fg);
    font-size: var(--fs-sm);
  }
  .banner-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-fg);
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    cursor: pointer;
  }
  button:hover {
    background: var(--color-bg-hover);
  }
  button.primary {
    background: var(--color-accent);
    color: var(--color-bg);
    border-color: var(--color-accent);
  }
  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
