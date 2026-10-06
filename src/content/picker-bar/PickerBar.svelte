<script lang="ts">
  import { onMount } from 'svelte';
  import { isUserGesture } from '../user-gesture';
  import type { RenderMode } from '../page-translate-v2/store';
  import { roving } from '../roving';

  interface Props {
    /** Pick element translates one block; Choose areas collects several, then Translate sends them. */
    kind: 'pick' | 'areas';
    initialStatus: string;
    initialMode?: RenderMode;
    onCancel: () => void;
    onTranslate?: () => void;
    onModeSelect?: (mode: RenderMode) => void;
  }
  let {
    kind,
    initialStatus,
    initialMode = 'inplace',
    onCancel,
    onTranslate,
    onModeSelect,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let status = $state(initialStatus);
  let blocked = $state(false);
  // svelte-ignore state_referenced_locally
  let mode = $state<RenderMode>(initialMode);
  let canTranslate = $state(false);
  let refusal = $state<string | null>(null);
  let live = $state('');
  let keysOpen = $state(false);
  // Plain: only the handlers read it.
  let keysPinned = false;
  let refusalTimer: ReturnType<typeof setTimeout> | undefined;
  let keysButton: HTMLButtonElement | null = $state(null);

  const REFUSAL_MS = 4000;
  const statusId = $derived(`ega-picker-status-${kind}`);
  const keysId = $derived(`ega-picker-keys-${kind}`);

  /** The bar's own state; the controllers patch it in place, so its live region survives every hover. */
  export function set(next: {
    status?: string;
    blocked?: boolean;
    canTranslate?: boolean;
    mode?: RenderMode;
  }): void {
    if (next.status !== undefined) status = next.status;
    if (next.blocked !== undefined) blocked = next.blocked;
    if (next.canTranslate !== undefined) canTranslate = next.canTranslate;
    if (next.mode !== undefined) mode = next.mode;
  }

  /** A refusal replaces the status for 4 s, then the default returns. Not a toast. */
  export function flash(text: string): void {
    clearTimeout(refusalTimer);
    refusal = text;
    refusalTimer = setTimeout(() => (refusal = null), REFUSAL_MS);
  }

  /** Cursor moves and selections are spoken here, apart from the visible status. */
  export function announce(text: string): void {
    live = text;
  }

  const translate = (e: Event): void => {
    // Translate starts requests, so a click the page dispatches is ignored; the reason stays visible while it is blocked.
    if (isUserGesture(e) && canTranslate) onTranslate?.();
  };
  const selectMode = (next: RenderMode) => (e: Event) => {
    if (!isUserGesture(e)) return;
    mode = next;
    onModeSelect?.(next);
  };

  function keysKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && keysOpen) {
      e.stopPropagation();
      keysOpen = false;
      keysPinned = false;
    }
  }

  onMount(() => {
    // Events from the shadow tree reach the document retargeted to the host, so check the composed path.
    const outside = (e: PointerEvent): void => {
      if (keysPinned && keysButton && !e.composedPath().includes(keysButton)) {
        keysOpen = false;
        keysPinned = false;
      }
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  });

  const shown = $derived(refusal ?? status);
</script>

<div
  class="ega-picker-bar"
  role="toolbar"
  aria-label={kind === 'pick' ? 'Pick element' : 'Choose areas'}
  data-ega-picker-bar={kind}
  use:roving
>
  <span class="ega-sr-only" data-ega-ms-live role="status" aria-live="polite">{live}</span>
  <span class="lead">
    <span class="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24"
        ><path d="M5 3a2 2 0 0 0-2 2" /><path d="M19 3a2 2 0 0 1 2 2" /><path
          d="M5 21a2 2 0 0 1-2-2"
        /><path d="M9 3h1" /><path d="M9 21h2" /><path d="M14 3h1" /><path d="M3 9v1" /><path
          d="M21 9v2"
        /><path d="M3 14v1" />{#if kind === 'pick'}<path
            d="m12 12 4 10 1.7-4.3L22 16Z"
          />{:else}<path d="M19 21a2 2 0 0 0 2-2" /><path d="M21 14v1" /><path
            d="M14 21h1"
          />{/if}</svg
      >
    </span>
    <span
      class="status"
      class:refusal={blocked || refusal !== null}
      id={statusId}
      role="status"
      data-ega-ms-count>{shown}</span
    >
  </span>
  <div class="controls">
    {#if kind === 'areas'}
      <!-- Inside the toolbar, arrows move focus across every control; Space, Enter or a click picks a mode. -->
      <div class="modes" role="radiogroup" aria-label="How to show the translation">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'inplace'}
          data-ega-ms-mode="inplace"
          onclick={selectMode('inplace')}>Replace text</button
        >
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'bilingual'}
          data-ega-ms-mode="bilingual"
          onclick={selectMode('bilingual')}>Show both</button
        >
      </div>
      <button
        type="button"
        class="translate"
        data-ega-ms-translate
        aria-disabled={canTranslate ? undefined : 'true'}
        aria-describedby={canTranslate ? undefined : statusId}
        onclick={translate}>Translate</button
      >
    {/if}
    <span class="keys-wrap">
      <button
        bind:this={keysButton}
        type="button"
        class="ghost"
        aria-expanded={keysOpen}
        aria-controls={keysId}
        data-ega-picker-keys
        onpointerenter={() => (keysOpen = true)}
        onpointerleave={() => {
          if (!keysPinned) keysOpen = false;
        }}
        onfocus={() => (keysOpen = true)}
        onblur={() => {
          if (!keysPinned) keysOpen = false;
        }}
        onclick={() => {
          keysPinned = !keysPinned;
          keysOpen = keysPinned;
        }}
        onkeydown={keysKey}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01"
          /><rect width="20" height="16" x="2" y="4" rx="2" /></svg
        >Keys</button
      >
      <div class="keys" id={keysId} role="tooltip" hidden={!keysOpen}>
        <span><kbd>↑</kbd> <kbd>↓</kbd> larger or smaller block</span>
        <span><kbd>Tab</kbd> next block</span>
        {#if kind === 'areas'}
          <span><kbd>Space</kbd> choose block</span>
          <span><kbd>Enter</kbd> translate</span>
          <span><kbd>M</kbd> switch Replace text / Show both</span>
        {:else}
          <span><kbd>Space</kbd> or <kbd>Enter</kbd> translate this block</span>
        {/if}
        <span><kbd>Esc</kbd> cancel</span>
      </div>
    </span>
    <button type="button" class="ghost" data-ega-ms-exit onclick={onCancel}>Cancel</button>
  </div>
</div>
