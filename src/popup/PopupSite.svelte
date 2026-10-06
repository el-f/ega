<script lang="ts">
  import Info from '@lucide/svelte/icons/info';
  import Icon from '@/shared/ui/Icon.svelte';
  import type { HeldBack } from '@/shared/messages';
  import { heldBackText, type PopupPageState } from './page-state';

  interface Props {
    state: PopupPageState;
    showSwitch: boolean;
    host: { full: string; short: string };
    siteOn: boolean;
    heldBack: HeldBack | undefined;
    /** Id the page actions point their aria-describedby at. */
    statusId: string;
    onSiteChange: (on: boolean) => void;
    onTranslateAnyway: () => void;
    onReload: () => void;
  }

  let {
    state,
    showSwitch,
    host,
    siteOn,
    heldBack,
    statusId,
    onSiteChange,
    onTranslateAnyway,
    onReload,
  }: Props = $props();

  const status = $derived.by((): { text: string; action?: 'anyway' | 'reload' } | null => {
    switch (state) {
      case 'restricted':
        return { text: "Ega can't run on this page." };
      case 'site-off':
        return { text: "Ega won't translate on this site." };
      case 'not-running':
        return { text: 'Reload this page to use Ega here.', action: 'reload' };
      case 'held-back':
        return heldBack ? { text: heldBackText(heldBack), action: 'anyway' } : null;
      case 'default':
        return null;
    }
  });
</script>

<div class="site" data-ega-popup-site>
  {#if showSwitch}
    <label class="switch-row">
      <span class="switch-label" aria-hidden="true">Ega on {host.short}</span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        aria-label={`Ega on ${host.full}`}
        checked={siteOn}
        data-ega-site-switch
        onchange={(e) => onSiteChange(e.currentTarget.checked)}
      />
    </label>
  {/if}
  {#if status}
    <div class="status" data-ega-popup-status={state}>
      <span class="status-icon"><Icon icon={Info} size={16} /></span>
      <p id={statusId} class="status-text">
        {status.text}
        {#if status.action === 'anyway'}
          <button type="button" class="status-action" onclick={onTranslateAnyway}
            >Translate anyway</button
          >
        {:else if status.action === 'reload'}
          <button type="button" class="status-action" onclick={onReload}>Reload page</button>
        {/if}
      </p>
    </div>
  {/if}
</div>

<style>
  .site {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 36px;
    cursor: pointer;
    font-size: var(--fs-base);
    color: var(--color-fg);
  }
  .switch-label {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .switch {
    appearance: none;
    flex: 0 0 auto;
    position: relative;
    width: 36px;
    height: 20px;
    margin: 0;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    cursor: pointer;
    transition: background-color var(--motion-fast) var(--ease-out);
  }
  .switch::after {
    content: '';
    position: absolute;
    inset-block-start: 2px;
    inset-inline-start: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-muted);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .switch:checked {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  .switch:checked::after {
    background: var(--color-accent-fg);
    transform: translateX(16px);
  }
  .switch:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .switch,
    .switch::after {
      transition: none;
    }
  }
  @media (forced-colors: active) {
    .switch::after {
      background: CanvasText;
    }
  }
  .status {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .status-icon {
    display: inline-flex;
    padding-block-start: 1px;
    color: var(--color-muted);
  }
  .status-text {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--color-fg);
  }
  .status-action {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 var(--space-2);
    margin-inline-start: var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .status-action:hover {
    background: var(--color-accent-bg-hover);
  }
  .status-action:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
