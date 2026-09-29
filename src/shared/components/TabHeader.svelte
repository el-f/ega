<script lang="ts">
  import { TAB_DESCRIPTIONS, TAB_LABELS, type SettingsTab } from '@/shared/settings-tabs';

  interface Props {
    tab: SettingsTab;
  }
  const { tab }: Props = $props();
</script>

<header class="tab-header">
  <h1 class="tab-title">{TAB_LABELS[tab]}</h1>
  <p class="tab-desc">{TAB_DESCRIPTIONS[tab]}</p>
</header>

<style>
  .tab-header {
    margin: 0 0 var(--space-4) 0;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .tab-title {
    margin: 0 0 var(--space-1) 0;
    font-size: var(--fs-xl);
    font-weight: 600;
    line-height: var(--lh-heading);
    color: var(--color-fg);
  }
  .tab-desc {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
