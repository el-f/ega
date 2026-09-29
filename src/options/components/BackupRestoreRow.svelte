<script lang="ts">
  /** Export + import for one scope; the whole-settings backup is BackupRestoreCard. */
  import Button from '@/shared/ui/Button.svelte';
  import ActionIcon from '@/shared/ui/ActionIcon.svelte';
  import { id as makeId } from '@/shared/uuid';
  import BackupStatus from './BackupStatus.svelte';
  import { handleImportFilePick } from '@/options/backup-file';
  import type { ImportStatus } from '@/options/import-bundle';

  interface Props {
    onExport: () => void | Promise<void>;
    onImport: (file: File) => void | Promise<void>;
    status: ImportStatus | null;
    /** Visible scope label rendered inside the export button. */
    scope: string;
  }

  const { onExport, onImport, status, scope }: Props = $props();

  const importId = makeId('ega-backup-import');
</script>

<div class="backup-row" data-ega-backup-restore-row>
  <div class="row">
    <Button variant="secondary" iconKind="export" onclick={() => void onExport()}>
      Export {scope}
    </Button>
    <label for={importId} class="file-label">
      <ActionIcon kind="import" size={16} />
      <span>Import {scope}…</span>
    </label>
    <input
      id={importId}
      type="file"
      accept="application/json,.json"
      class="ega-sr-only"
      onchange={(ev) => void handleImportFilePick(ev, onImport)}
    />
  </div>
  <BackupStatus {status} />
</div>

<style>
  .backup-row {
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
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .file-label:hover {
    background: var(--color-bg-hover);
  }
  .file-label:focus-within {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
