<script lang="ts">
  // Cycle mode renders through IconButton: a CSS [data-tooltip] pseudo next to a Bits UI tooltip jitters on hover.
  import Laptop from '@lucide/svelte/icons/laptop';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import type { ThemePref } from '@/shared/theme';

  interface Props {
    theme: ThemePref;
    onSetTheme: (next: ThemePref) => void;
    /** Single-icon cycling button instead of the radiogroup. */
    cycle?: boolean;
  }

  const { theme, onSetTheme, cycle = false }: Props = $props();

  const CYCLE_ORDER: readonly ThemePref[] = ['system', 'light', 'dark'];
  function advance(): void {
    const idx = CYCLE_ORDER.indexOf(theme);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length] ?? 'system';
    onSetTheme(next);
  }

  function onKeydown(e: KeyboardEvent): void {
    const idx = CYCLE_ORDER.indexOf(theme);
    let nextIdx: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (idx + 1) % CYCLE_ORDER.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      nextIdx = (idx - 1 + CYCLE_ORDER.length) % CYCLE_ORDER.length;
    else return;
    e.preventDefault();
    const next = CYCLE_ORDER[nextIdx];
    if (next) {
      onSetTheme(next);
      const el = e.currentTarget as HTMLElement;
      el.querySelector<HTMLElement>(`[data-ega-theme="${next}"]`)?.focus();
    }
  }
  const cycleLabel = $derived(
    theme === 'system' ? 'System theme' : theme === 'light' ? 'Light theme' : 'Dark theme',
  );
  const cycleNextLabel = $derived.by(() => {
    const idx = CYCLE_ORDER.indexOf(theme);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length] ?? 'system';
    return next === 'system' ? 'System' : next === 'light' ? 'Light' : 'Dark';
  });
  const cycleIcon = $derived(theme === 'system' ? Laptop : theme === 'light' ? Sun : Moon);
</script>

{#if cycle}
  <IconButton
    icon={cycleIcon}
    ariaLabel={`${cycleLabel}. Click to switch to ${cycleNextLabel}`}
    tooltip={`${cycleLabel} — click for ${cycleNextLabel}`}
    tooltipPlacement="bottom"
    size="sm"
    dataAttrs={{ 'data-ega-theme-toggle': '' }}
    onclick={advance}
  />
{:else}
  <div
    class="theme-toggle"
    role="radiogroup"
    aria-label="Theme"
    tabindex="-1"
    data-ega-theme-toggle
    onkeydown={onKeydown}
  >
    <button
      type="button"
      role="radio"
      aria-checked={theme === 'system'}
      tabindex={theme === 'system' ? 0 : -1}
      class:active={theme === 'system'}
      data-ega-theme="system"
      data-tooltip="System theme"
      data-tooltip-placement="bottom"
      onclick={() => onSetTheme('system')}
    >
      <Laptop size={14} strokeWidth={1.75} />
      <span>System</span>
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={theme === 'light'}
      tabindex={theme === 'light' ? 0 : -1}
      class:active={theme === 'light'}
      data-ega-theme="light"
      data-tooltip="Light theme"
      data-tooltip-placement="bottom"
      onclick={() => onSetTheme('light')}
    >
      <Sun size={14} strokeWidth={1.75} />
      <span>Light</span>
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={theme === 'dark'}
      tabindex={theme === 'dark' ? 0 : -1}
      class:active={theme === 'dark'}
      data-ega-theme="dark"
      data-tooltip="Dark theme"
      data-tooltip-placement="bottom"
      onclick={() => onSetTheme('dark')}
    >
      <Moon size={14} strokeWidth={1.75} />
      <span>Dark</span>
    </button>
  </div>
{/if}

<style>
  .theme-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .theme-toggle button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: transparent;
    color: var(--color-muted);
    border: 0;
    padding: var(--space-1) var(--space-2);
    font-size: var(--fs-sm);
    line-height: 1;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }
  .theme-toggle button.active {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .theme-toggle button:hover:not(.active) {
    color: var(--color-fg);
  }
</style>
