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
    /** Overrides "Export <scope>". */
    exportLabel?: string;
    /** Overrides "Import <scope>...". */
    importLabel?: string;
    /** Marks the export button (tests and the screenshot harness find it by this). */
    exportAttr?: string;
  }

  const {
    onExport,
    onImport,
    status,
    scope,
    exportBlockedReason = null,
    exportLabel,
    importLabel,
    exportAttr,
  }: Props = $props();

  const importId = makeId('ega-backup-import');
  const reasonId = makeId('ega-backup-export-reason');
</script>

<div class="backup-row" data-ega-backup-restore-row>
  <div class="row">
    <Button
      variant="secondary"
      size="sm"
      iconKind="export"
      ariaDisabled={exportBlockedReason !== null}
      {...exportBlockedReason !== null ? { describedBy: reasonId } : {}}
      {...exportAttr ? { dataAttrs: { [exportAttr]: true } } : {}}
      onclick={() => void onExport()}
    >
      {exportLabel ?? `Export ${scope}`}
    </Button>
    <!-- The input comes first: it takes the keyboard focus, and the label after it shows the ring. -->
    <input
      id={importId}
      type="file"
      accept="application/json,.json"
      class="ega-sr-only file-input"
      onchange={(ev) => void handleImportFilePick(ev, onImport)}
    />
    <label for={importId} class="file-label">
      <ActionIcon kind="import" size={16} />
      <span>{importLabel ?? `Import ${scope}...`}</span>
    </label>
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
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .reason {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  /* The small secondary Button's box, so Import matches Export beside it. */
  .file-label {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    min-height: 28px;
    margin: 0;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    font-weight: var(--ega-fw-medium, 500);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }
  .file-label:hover {
    background: var(--color-bg-hover);
  }
  .file-input:focus-visible + .file-label {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
