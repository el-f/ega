<script lang="ts">
  import { tick } from 'svelte';
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import { pillPhase, pillStatus, type PageProgress } from './page-translate-v2/progress';
  import { roving } from './roving';

  interface Props {
    initial: PageProgress;
    liveMessage: string;
    onStop: () => void;
    onRemove: () => void;
    onRetryFailed: () => void;
    onOpenSettings: () => void;
    onToggleOriginal: (showOriginal: boolean) => void;
    onClose: () => void;
  }
  let {
    initial,
    liveMessage,
    onStop,
    onRemove,
    onRetryFailed,
    onOpenSettings,
    onToggleOriginal,
    onClose,
  }: Props = $props();

  // The session pushes a new snapshot per block; one reactive value, no remount.
  // svelte-ignore state_referenced_locally
  let p = $state<PageProgress>(initial);
  // svelte-ignore state_referenced_locally
  let live = $state(liveMessage);
  let now = $state(Date.now());
  let showingOriginal = $state(false);
  let menuOpen = $state(false);
  let detailsOpen = $state(false);
  let settledAt = 0;
  let root: HTMLDivElement | null = $state(null);

  const phase = $derived(pillPhase(p, now));
  const settled = $derived(phase === 'settled');
  const translated = $derived(p.done - p.failed);
  const status = $derived(pillStatus(p, now));
  const failure = $derived(settled && p.failed > 0 ? p.failure : undefined);
  const settingsFirst = $derived(failure?.actions[0] === 'open-settings');
  const max = $derived(Math.max(0, p.total - p.waiting));

  /** A click guard: the second click of a double-click on Stop must not land on Close bar. */
  const CLOSE_GUARD_MS = 400;

  export function set(next: PageProgress): void {
    const sr = root?.getRootNode();
    const active = sr instanceof ShadowRoot ? sr.activeElement : document.activeElement;
    const focused = active instanceof HTMLElement && root?.contains(active) ? active : null;
    if (next.settled && !p.settled) settledAt = Date.now();
    p = next;
    // A button that removed itself would drop focus to the page; the next live control takes it.
    if (focused) {
      void tick().then(() => {
        if (!focused.isConnected) root?.querySelector<HTMLElement>('.actions button')?.focus();
      });
    }
  }

  export function setLive(text: string): void {
    live = text;
  }

  // The countdown is the only text that moves on its own.
  $effect(() => {
    if (phase !== 'paused') return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  function toggleOriginal(): void {
    showingOriginal = !showingOriginal;
    onToggleOriginal(showingOriginal);
  }

  function close(): void {
    if (Date.now() - settledAt < CLOSE_GUARD_MS) return;
    onClose();
  }

  function menuKey(e: KeyboardEvent): void {
    const items = [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(e.target as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      menuOpen = false;
      root?.querySelector<HTMLElement>('[data-ega-batch-more]')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  }

  async function openMenu(viaKeyboard: boolean): Promise<void> {
    menuOpen = !menuOpen;
    if (menuOpen && viaKeyboard) {
      await tick();
      root?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }
</script>

<div
  bind:this={root}
  class="ega-batch-progress"
  class:has-failure={failure !== undefined}
  role="group"
  aria-label="Page translation"
  data-ega-batch-progress
  data-phase={phase}
>
  {#if !settled}
    <div
      class="line"
      role="progressbar"
      aria-label="Translation progress"
      aria-valuemin="0"
      aria-valuemax={max}
      aria-valuenow={Math.min(p.done, max)}
      data-ega-batch-bar
    >
      <div
        class="line-fill"
        style:width="{max > 0 ? (Math.min(p.done, max) / max) * 100 : 0}%"
      ></div>
    </div>
  {/if}
  {#if detailsOpen && failure}
    <div class="details" data-ega-batch-details>
      <div class="details-head">
        <span>Error details</span>
        <button
          type="button"
          class="btn"
          onclick={() => void navigator.clipboard.writeText(failure.details.join('\n'))}
          >Copy</button
        >
      </div>
      <div class="details-text" tabindex="-1">{failure.details.join('\n')}</div>
    </div>
  {/if}
  <div class="row">
    <span class="mark" aria-hidden="true">
      {#if failure}
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
      {:else}
        <BrandMark size={16} label="" />
      {/if}
    </span>
    <span class="status" data-ega-batch-label>{status}</span>
    <span class="ega-sr-only" role="status" data-ega-batch-live>{live}</span>
    <div class="actions" role="toolbar" aria-label="Page translation actions" use:roving>
      {#if !settled}
        <button type="button" class="btn" data-ega-batch-cancel onclick={onStop}>Stop</button>
      {:else}
        {#if failure && settingsFirst}
          <button type="button" class="btn first" onclick={onOpenSettings}>Open settings</button>
        {/if}
        {#if failure && failure.actions.includes('try-again')}
          <button
            type="button"
            class="btn"
            class:first={!settingsFirst}
            aria-label="Try again, {p.failed} failed {p.failed === 1 ? 'area' : 'areas'}"
            data-ega-batch-retry
            onclick={onRetryFailed}>Try again</button
          >
        {/if}
        {#if translated > 0}
          <button
            type="button"
            class="btn"
            aria-pressed={showingOriginal}
            data-ega-batch-original
            onclick={toggleOriginal}>Show original</button
          >
        {/if}
        <button
          type="button"
          class="icon"
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-ega-batch-more
          onclick={(e) => void openMenu(e.detail === 0)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle
              cx="19"
              cy="12"
              r="1"
            /></svg
          >
        </button>
        <button
          type="button"
          class="icon"
          aria-label="Close bar"
          data-ega-batch-close
          onclick={close}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      {/if}
    </div>
  </div>
  {#if menuOpen}
    <div class="menu" role="menu" aria-label="More" tabindex="-1" onkeydown={menuKey}>
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        data-ega-batch-remove
        onclick={() => {
          menuOpen = false;
          onRemove();
        }}>Remove translation</button
      >
      {#if failure}
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          onclick={() => {
            menuOpen = false;
            detailsOpen = true;
          }}>Show error details</button
        >
      {/if}
    </div>
  {/if}
</div>
