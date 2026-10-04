<script lang="ts">
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import ActiveBackendChip from '@/shared/components/ActiveBackendChip.svelte';
  import Settings from '@lucide/svelte/icons/settings';
  import type { Settings as SettingsT } from '@/shared/types';
  import { openOptionsTab } from '@/shared/open-options-tab';

  interface Props {
    /** Live settings — drives the active backend chip.
     *  Null on first paint before storage hydrates. */
    settings: SettingsT | null;
    onOpenOptions: () => void;
    /** Readiness of the backend chain; null while the chip is still checking. */
    onBackendReadyChange?: (ready: boolean | null) => void;
  }

  let { settings, onOpenOptions, onBackendReadyChange }: Props = $props();

  function jumpToBackends(): void {
    openOptionsTab('backends');
  }
</script>

<div class="popup-header">
  <h1 class="popup-header-brand"><BrandMark size={16} /></h1>
  <div class="popup-header-actions">
    {#if settings}
      <ActiveBackendChip
        {settings}
        onJump={jumpToBackends}
        {...onBackendReadyChange ? { onReadyChange: onBackendReadyChange } : {}}
      />
    {/if}
    <IconButton icon={Settings} ariaLabel="Open settings" size="sm" onclick={onOpenOptions} />
  </div>
</div>

<style>
  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
  }
  .popup-header-brand {
    margin: 0;
    display: inline-flex;
    align-items: center;
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--color-fg);
    flex: 0 0 auto;
  }
  .popup-header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }
</style>
