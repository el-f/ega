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
    /** Export stays focusable but does nothing, and this line says why. */
    exportBlockedReason?: string | null;
  }

  const { onExport, onImport, status, scope, exportBlockedReason = null }: Props = $props();

  const importId = makeId('ega-backup-import');
  const reasonId = makeId('ega-backup-export-reason');
</script>

<div class="backup-row" data-ega-backup-restore-row>
  <div class="row">
    <Button
      variant="secondary"
      iconKind="export"
      ariaDisabled={exportBlockedReason !== null}
      {...exportBlockedReason !== null ? { describedBy: reasonId } : {}}
      onclick={() => void onExport()}
    >
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
  {#if exportBlockedReason !== null}
    <p class="reason" id={reasonId}>{exportBlockedReason}</p>
  {/if}
  <BackupStatus {status} />
</div>

<style>
  .backup-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* Stretch: Export and Import are the same height whatever their icons and text measure. */
  .row {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .reason {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
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
