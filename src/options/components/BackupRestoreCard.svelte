<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import BackupStatus from './BackupStatus.svelte';
  import { handleImportFilePick } from '@/options/backup-file';
  import type { ImportStatus } from '@/options/import-bundle';

  interface Props {
    onExport: (scope: 'all' | 'taskPresets', includeKeys: boolean) => Promise<void>;
    onImport: (file: File) => Promise<void>;
    status: ImportStatus | null;
  }

  let { onExport, onImport, status }: Props = $props();

  let menuOpen = $state(false);
  let includeKeys = $state(false);
  let menuTriggerEl: HTMLButtonElement | null = $state(null);
  let menuEl: HTMLUListElement | null = $state(null);

  async function toggleMenu(): Promise<void> {
    menuOpen = !menuOpen;
    if (menuOpen) {
      // Focus first menuitem after DOM paints.
      await tick();
      const first = menuEl?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }
  }

  function onMenuKeydown(e: KeyboardEvent): void {
    if (!menuEl) return;
    const items = Array.from(menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }
  // Task-preset exports never carry API keys, so only the 'all' scope reads includeKeys.
  async function pick(scope: 'all' | 'taskPresets'): Promise<void> {
    menuOpen = false;
    menuTriggerEl?.focus();
    if (scope === 'all' && includeKeys) {
      const ok = await confirmDialog({
        title: 'Export with API keys',
        body: 'This writes your raw API keys into the JSON file. Anyone with the file can use your keys and spend your credit. Type EXPORT KEYS to confirm.',
        confirmLabel: 'Export with keys',
        danger: true,
        typeToConfirm: 'EXPORT KEYS',
      });
      if (!ok) return;
    }
    await onExport(scope, includeKeys);
  }
  onMount(() => {
    function close(e: MouseEvent): void {
      if (!menuOpen) return;
      const target = e.target as Element | null;
      if (target && !target.closest('.export-wrap')) {
        // Leave focus where the user clicked.
        menuOpen = false;
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && menuOpen) {
        menuOpen = false;
        menuTriggerEl?.focus();
      }
    }
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

<div class="backup-card">
  <div class="row">
    <input id="adv-include-keys" type="checkbox" bind:checked={includeKeys} />
    <label for="adv-include-keys" class="inline-label">
      Include API keys in the export
      <span class="warn">(not recommended for sharing)</span>
    </label>
  </div>

  <div class="row export-row">
    <div class="export-wrap">
      <button
        bind:this={menuTriggerEl}
        type="button"
        data-ega-export-menu
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => void toggleMenu()}>Export…</button
      >
      {#if menuOpen}
        <ul bind:this={menuEl} class="export-menu" role="menu" onkeydown={onMenuKeydown}>
          <li>
            <button role="menuitem" type="button" onclick={() => pick('all')}>All settings</button>
          </li>
          <li>
            <button
              role="menuitem"
              type="button"
              data-ega-task-presets-export
              onclick={() => pick('taskPresets')}
            >
              Task presets only
            </button>
          </li>
        </ul>
      {/if}
    </div>
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
  .export-wrap {
    position: relative;
    display: inline-block;
  }
  .export-menu {
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px var(--color-shadow);
    min-width: 12rem;
    z-index: 10;
  }
  .export-menu li {
    margin: 0;
  }
  .export-menu button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    color: var(--color-fg);
    font-size: var(--fs-sm);
    border-radius: var(--radius-sm);
  }
  .export-menu button:hover {
    background: var(--color-bg-hover);
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
  .inline-label {
    margin: 0;
  }
  .warn {
    color: var(--color-muted);
    font-size: var(--fs-xs);
  }
</style>
