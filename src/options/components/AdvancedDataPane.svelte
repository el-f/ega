<script lang="ts">
  import type { Settings } from '@/shared/types';
  import type { ImportStatus } from '@/options/import-bundle';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import BackupRestoreCard from '@/options/components/BackupRestoreCard.svelte';
  import SiteOverridesReview from '@/options/components/SiteOverridesReview.svelte';
  import SavedConversations from '@/options/components/SavedConversations.svelte';
  import ResetAndDeleteCard from '@/options/components/ResetAndDeleteCard.svelte';

  interface Props {
    s: Settings;
    backupStatus: ImportStatus | null;
    onExport: (includeKeys: boolean) => Promise<void>;
    onUnifiedImport: (file: File) => Promise<void>;
    onSaved: (next: Settings) => void;
    onReset: () => Promise<void>;
    onClearCache: () => Promise<void>;
    onDeleteAll: () => void;
  }

  const {
    s,
    backupStatus,
    onExport,
    onUnifiedImport,
    onSaved,
    onReset,
    onClearCache,
    onDeleteAll,
  }: Props = $props();
</script>

<div data-ega-setting="advanced.dataBackup">
  <SectionCard
    title="Backup and restore"
    description="Every setting in one file"
    info={{
      label: 'About backups',
      text: 'Import shows what will change before it overwrites anything. Leave API keys out of a file you share.',
    }}
  >
    <BackupRestoreCard {onExport} onImport={onUnifiedImport} status={backupStatus} />
  </SectionCard>
</div>

<SiteOverridesReview settings={s} {onSaved} />

<SavedConversations />

<ResetAndDeleteCard {onReset} {onClearCache} {onDeleteAll} />
