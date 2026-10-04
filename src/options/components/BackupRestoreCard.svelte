<script lang="ts">
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import BackupStatus from './BackupStatus.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import { handleImportFilePick } from '@/options/backup-file';
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
        title: 'Export with API keys',
        body: 'This writes your raw API keys into the JSON file. Anyone with the file can use your keys and spend your credit. Type EXPORT KEYS to confirm.',
        confirmLabel: 'Export with keys',
        danger: true,
        typeToConfirm: 'EXPORT KEYS',
      });
      if (!ok) return;
    }
    await onExport(includeKeys);
  }
</script>

<div class="backup-card">
  <div class="row">
    <Checkbox id="adv-include-keys" bind:checked={includeKeys}>
      Include API keys in the export
      <span class="warn">(not recommended for sharing)</span>
    </Checkbox>
  </div>

  <div class="row export-row">
    <button type="button" data-ega-export-all onclick={() => void exportSettings()}>
      Export all settings
    </button>
    <label for="adv-import" class="file-label">Import…</label>
    <input
      id="adv-import"
      type="file"
      accept="application/json,.json"
      class="ega-sr-only"
      onchange={(ev) => void handleImportFilePick(ev, onImport)}
    />
  </div>
  <BackupStatus {status} />
</div>

<style>
  .backup-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .file-label {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .file-label:focus-within {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .warn {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
