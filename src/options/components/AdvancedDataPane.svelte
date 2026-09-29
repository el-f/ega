<script lang="ts">
  import type { Settings } from '@/shared/types';
  import type { ImportStatus } from '@/options/import-bundle';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import BackupRestoreCard from '@/options/components/BackupRestoreCard.svelte';
  import SiteOverridesReview from '@/options/components/SiteOverridesReview.svelte';

  interface Props {
    s: Settings;
    backupStatus: ImportStatus | null;
    onUnifiedExport: (scope: 'all' | 'taskPresets', includeKeys: boolean) => Promise<void>;
    onUnifiedImport: (file: File) => Promise<void>;
    onClearSiteKeys: (keys: readonly string[]) => Promise<void>;
    onClearAllSitePrefs: () => Promise<void>;
    onResetAllToDefaults: () => Promise<void>;
  }

  const {
    s,
    backupStatus,
    onUnifiedExport,
    onUnifiedImport,
    onClearSiteKeys,
    onClearAllSitePrefs,
    onResetAllToDefaults,
  }: Props = $props();
</script>

<div data-ega-setting="advanced.dataBackup">
  <SectionCard
    title="Backup &amp; restore"
    description="Export settings or task presets as JSON. Import asks before overwriting."
  >
    <BackupRestoreCard
      onExport={onUnifiedExport}
      onImport={onUnifiedImport}
      status={backupStatus}
    />
  </SectionCard>
</div>

<div data-ega-per-site-card data-ega-setting="advanced.siteOverrides">
  <SectionCard
    title="Site overrides"
    description="Sites where Ega is turned off, and their last direction; right-click a page to toggle Ega."
  >
    <SiteOverridesReview
      settings={s}
      onClearKeys={onClearSiteKeys}
      onClearAll={onClearAllSitePrefs}
    />
  </SectionCard>
</div>

<div data-ega-setting="advanced.resetEverything">
  <SectionCard
    title="Reset Advanced settings"
    description="Resets the template, temperature, max tokens and site overrides only."
  >
    <div class="row">
      <Button
        variant="danger"
        iconKind="warn"
        dataAttrs={{ 'data-ega-reset-defaults': true }}
        onclick={onResetAllToDefaults}
      >
        Reset these settings to defaults
      </Button>
    </div>
  </SectionCard>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
