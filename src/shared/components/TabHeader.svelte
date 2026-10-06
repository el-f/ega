<script lang="ts">
  import { TAB_DESCRIPTIONS, TAB_LABELS, type SettingsTab } from '@/shared/settings-tabs';
  import InfoTip from '@/shared/ui/InfoTip.svelte';

  interface Props {
    tab: SettingsTab;
    /** An (i) toggletip after the title, for help longer than the one-line description. */
    info?: { label: string; text: string };
  }
  const { tab, info }: Props = $props();
</script>

<header class="tab-header">
  <div class="tab-title-row">
    <h1 class="tab-title">{TAB_LABELS[tab]}</h1>
    {#if info}<InfoTip label={info.label} text={info.text} />{/if}
  </div>
  <p class="tab-desc">{TAB_DESCRIPTIONS[tab]}</p>
</header>

<style>
  .tab-header {
    margin: 0 0 var(--space-5) 0;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .tab-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0 0 var(--space-1) 0;
  }
  .tab-title {
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: 600;
    line-height: var(--lh-heading);
    color: var(--color-fg);
  }
  .tab-desc {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
