<script lang="ts">
  /** The whole-settings backup: keys left out unless asked, the same Export and Import row as the other backup cards. */
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import BackupRestoreRow from './BackupRestoreRow.svelte';
  import type { ImportStatus } from '@/options/import-bundle';

  interface Props {
    onExport: (includeKeys: boolean) => Promise<void>;
    onImport: (file: File) => Promise<void>;
    status: ImportStatus | null;
  }

  let { onExport, onImport, status }: Props = $props();

  let includeKeys = $state(false);

  async function exportSettings(): Promise<void> {
    if (includeKeys) {
      const ok = await confirmDialog({
        title: 'Export with API keys?',
        body: 'The file will hold your API keys. Anyone with the file can use your keys and spend your credit.',
        confirmLabel: 'Export with keys',
        cancelLabel: 'Keep keys out',
        danger: true,
        typeToConfirm: 'EXPORT KEYS',
      });
      if (!ok) return;
    }
    await onExport(includeKeys);
  }
</script>

<div class="backup-card">
  <div class="keys">
    <Checkbox
      id="adv-include-keys"
      label="Include API keys"
      describedBy="adv-include-keys-hint"
      bind:checked={includeKeys}
    />
    <p class="hint" id="adv-include-keys-hint">Leave this off for a file you share</p>
  </div>
  <BackupRestoreRow
    onExport={exportSettings}
    {onImport}
    {status}
    scope="settings"
    exportLabel="Export all settings"
    importLabel="Import settings..."
    exportAttr="data-ega-export-all"
  />
</div>

<style>
  .backup-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .keys {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hint {
    margin: 0;
    padding-inline-start: calc(16px + var(--space-2));
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
</style>
