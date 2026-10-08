<script lang="ts">
  import { tick } from 'svelte';
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import { pillPhase, pillStatus, type PageProgress } from './page-translate-v2/progress';
  import { roving } from './roving';
  import { isUserGesture } from './user-gesture';

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
  let copied = $state(false);
  let detailsScroll = $state(false);
  let settledAt = 0;
  let root: HTMLDivElement | null = $state(null);
  let menu: HTMLDivElement | null = $state(null);
  let detailsText: HTMLDivElement | null = $state(null);

  const phase = $derived(pillPhase(p, now));
  const settled = $derived(phase === 'settled');
  const translated = $derived(p.done - p.failed);
  const status = $derived(
    settled && showingOriginal ? 'Showing the original page' : pillStatus(p, now),
  );
  const failure = $derived(settled && p.failed > 0 ? p.failure : undefined);
  const settingsFirst = $derived(failure?.actions[0] === 'open-settings');
  // After a settings change Try again leads, and Open settings stays beside it.
  const showSettings = $derived(settingsFirst || failure?.settingsChanged === true);
  // The line runs while work is in flight; a page waiting on scroll has nothing in flight.
  const working = $derived(phase === 'running' || phase === 'paused');
  const max = $derived(Math.max(0, p.total - p.waiting));

  /** A click guard: the second click of a double-click on Stop must not land on Close bar. */
  const CLOSE_GUARD_MS = 400;
  const COPIED_MS = 1500;

  export function set(next: PageProgress): void {
    const sr = root?.getRootNode();
    const active = sr instanceof ShadowRoot ? sr.activeElement : document.activeElement;
    const focused = active instanceof HTMLElement && root?.contains(active) ? active : null;
    // A pause that starts now counts down from now, not from the last tick.
    now = Date.now();
    if (next.settled && !p.settled) settledAt = now;
    p = next;
    if (next.showingOriginal !== undefined) showingOriginal = next.showingOriginal;
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

  // A click outside the menu closes it, as the menu button pattern does.
  $effect(() => {
    if (!menuOpen) return;
    // Events from inside the shadow root reach the document retargeted to the host, so check the composed path.
    const outside = (e: PointerEvent): void => {
      const path = e.composedPath();
      const button = moreButton();
      if (menu && !path.includes(menu) && !(button && path.includes(button))) closeMenu(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  });

  // Error details past four lines scroll, so the keyboard must be able to reach them.
  $effect(() => {
    const el = detailsText;
    void failure?.details;
    detailsScroll = el !== null && el.scrollHeight > el.clientHeight + 1;
  });

  /** A page script can reach these buttons through the open shadow root; only a real user acts. */
  function user(run: () => void): (e: Event) => void {
    return (e) => {
      if (isUserGesture(e)) run();
    };
  }

  function toggleOriginal(): void {
    showingOriginal = !showingOriginal;
    onToggleOriginal(showingOriginal);
  }

  function close(): void {
    if (Date.now() - settledAt < CLOSE_GUARD_MS) return;
    onClose();
  }

  function moreButton(): HTMLElement | null {
    return root?.querySelector<HTMLElement>('[data-ega-batch-more]') ?? null;
  }

  function closeMenu(refocus: boolean): void {
    menuOpen = false;
    if (refocus) moreButton()?.focus();
  }

  function menuKey(e: KeyboardEvent): void {
    const items = [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(e.target as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === 'Tab') {
      closeMenu(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  }

  function moreKey(e: KeyboardEvent): void {
    if (!menuOpen) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu(false);
    } else if (e.key === 'Tab') {
      closeMenu(false);
    }
  }

  function menuFocusOut(e: FocusEvent): void {
    const to = e.relatedTarget;
    if (to instanceof Node && (menu?.contains(to) || moreButton() === to)) return;
    menuOpen = false;
  }

  async function openMenu(viaKeyboard: boolean): Promise<void> {
    menuOpen = !menuOpen;
    if (menuOpen && viaKeyboard) {
      await tick();
      root?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }

  async function toggleDetails(): Promise<void> {
    menuOpen = false;
    detailsOpen = !detailsOpen;
    await tick();
    // The menu item that had focus is gone; focus goes to what the user asked for.
    if (detailsOpen) root?.querySelector<HTMLElement>('.details-head button')?.focus();
    else moreButton()?.focus();
  }

  async function copyDetails(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      live = 'Error details copied.';
      setTimeout(() => (copied = false), COPIED_MS);
    } catch {
      live = "Couldn't copy the error details.";
    }
  }
</script>

<div
  bind:this={root}
  class="ega-batch-progress"
  role="group"
  aria-label="Page translation"
  data-ega-batch-progress
  data-phase={phase}
>
  <div class="frame">
    {#if working}
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
            onclick={user(() => void copyDetails(failure.details.join('\n')))}
            >{copied ? 'Copied' : 'Copy'}</button
          >
        </div>
        <!-- A region that scrolls must take focus, or the keyboard cannot reach its last lines. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          bind:this={detailsText}
          class="details-text"
          role={detailsScroll ? 'region' : undefined}
          aria-label={detailsScroll ? 'Error details' : undefined}
          tabindex={detailsScroll ? 0 : undefined}
        >
          {failure.details.join('\n')}
        </div>
      </div>
    {/if}
    <div class="row">
      <span class="mark" aria-hidden="true">
        {#if failure}
          <svg viewBox="0 0 24 24"
            ><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg
          >
        {:else}
          <BrandMark size={16} label="" />
        {/if}
      </span>
      <span class="status" data-ega-batch-label>{status}</span>
      <span class="ega-sr-only" role="status" data-ega-batch-live>{live}</span>
      <div class="actions" role="toolbar" aria-label="Page translation actions" use:roving>
        {#if !settled}
          <button type="button" class="btn" data-ega-batch-cancel onclick={user(onStop)}
            >Stop</button
          >
        {:else}
          {#if failure && settingsFirst}
            <button type="button" class="btn first" onclick={user(onOpenSettings)}
              >Open settings</button
            >
          {/if}
          {#if failure && failure.actions.includes('try-again')}
            <button
              type="button"
              class="btn"
              class:first={!settingsFirst}
              aria-label="Try again, {p.failed} failed {p.failed === 1 ? 'area' : 'areas'}"
              data-ega-batch-retry
              onclick={user(onRetryFailed)}>Try again</button
            >
          {/if}
          {#if failure && showSettings && !settingsFirst}
            <button type="button" class="btn" onclick={user(onOpenSettings)}>Open settings</button>
          {/if}
          {#if translated > 0}
            <button
              type="button"
              class="btn"
              aria-pressed={showingOriginal}
              data-ega-batch-original
              onclick={user(toggleOriginal)}>Show original</button
            >
          {/if}
          <button
            type="button"
            class="icon"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-ega-batch-more
            onclick={(e) => {
              if (isUserGesture(e)) void openMenu(e.detail === 0);
            }}
            onkeydown={moreKey}
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
            onclick={user(close)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        {/if}
      </div>
    </div>
  </div>
  {#if menuOpen}
    <div
      bind:this={menu}
      class="menu"
      role="menu"
      aria-label="More"
      tabindex="-1"
      onkeydown={menuKey}
      onfocusout={menuFocusOut}
    >
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        data-ega-batch-remove
        onclick={user(() => {
          menuOpen = false;
          onRemove();
        })}>Remove translation</button
      >
      {#if failure}
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          onclick={user(() => void toggleDetails())}
          >{detailsOpen ? 'Hide error details' : 'Show error details'}</button
        >
      {/if}
    </div>
  {/if}
</div>
