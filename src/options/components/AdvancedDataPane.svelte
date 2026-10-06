<script lang="ts">
  import type { Settings } from '@/shared/types';
  import type { ImportStatus } from '@/options/import-bundle';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import BackupRestoreCard from '@/options/components/BackupRestoreCard.svelte';
  import SiteOverridesReview from '@/options/components/SiteOverridesReview.svelte';
  import SavedConversations from '@/options/components/SavedConversations.svelte';

  interface Props {
    s: Settings;
    backupStatus: ImportStatus | null;
    onExport: (includeKeys: boolean) => Promise<void>;
    onUnifiedImport: (file: File) => Promise<void>;
    onClearSiteKeys: (keys: readonly string[]) => Promise<void>;
    onClearAllSitePrefs: () => Promise<void>;
    onResetAllToDefaults: () => Promise<void>;
  }

  const {
    s,
    backupStatus,
    onExport,
    onUnifiedImport,
    onClearSiteKeys,
    onClearAllSitePrefs,
    onResetAllToDefaults,
  }: Props = $props();
</script>

<div data-ega-setting="advanced.dataBackup">
  <SectionCard
    title="Backup &amp; restore"
    description="Export all settings as JSON. Import asks before overwriting."
  >
    <BackupRestoreCard {onExport} onImport={onUnifiedImport} status={backupStatus} />
  </SectionCard>
</div>

<div data-ega-per-site-card data-ega-setting="advanced.siteOverrides">
  <SectionCard
    title="Site overrides"
    description="Sites where Ega is off or has its own source language; the right-click menu changes them."
  >
    <SiteOverridesReview
      settings={s}
      onClearKeys={onClearSiteKeys}
      onClearAll={onClearAllSitePrefs}
    />
  </SectionCard>
</div>

<div data-ega-setting="advanced.savedConversations">
  <SectionCard
    title="Saved conversations"
    description="Side panel conversations kept on this device, one per site."
  >
    <SavedConversations />
  </SectionCard>
</div>

<div data-ega-setting="advanced.resetEverything">
  <SectionCard
    title="Reset prompt and generation settings"
    description="Resets the Translate prompt, Effort, temperature, answer length and site overrides."
  >
    <p class="reset-where">
      The prompt is on the Tasks tab; Effort, temperature and answer length are on the Translate
      tab. Language prompts, API keys and the audit log are kept.
    </p>
    <div class="row">
      <Button
        variant="danger"
        iconKind="warn"
        dataAttrs={{ 'data-ega-reset-defaults': true }}
        onclick={onResetAllToDefaults}
      >
        Reset to defaults
      </Button>
    </div>
  </SectionCard>
</div>

<style>
  .reset-where {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
