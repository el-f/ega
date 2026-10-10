<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { tick } from 'svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
  import Icon from '@/shared/ui/Icon.svelte';
  import type { TipState } from '../tipState.svelte';
  import { taskCapabilities, type TaskView } from '@/shared/task-view';
  import type { SettingsTab } from '@/shared/settings-tabs';
  import { isRetryable, optionsTabForMessage } from '@/shared/error-policy';
  import { answerAgainLabel } from '@/shared/refine-presets';
  import { outsidePressFocus } from '@/shared/menu-focus';
  import { isUserGesture } from '../user-gesture';

  interface Props {
    tip: TipState;
    mode: 'loading' | 'error' | 'success';
    task: string;
    views: readonly TaskView[];
    swapDisabled: boolean;
    detailsOpen: boolean;
    errorDetailsOpen: boolean;
    hasErrorDetails: boolean;
    translateInto: { id: string; label: string } | null;
    canEscalate: boolean;
    escalationKind: 'continue' | 'pin' | 'open-image' | 'open-panel';
    changing: boolean;
    onCancel: () => void;
    onCopy: () => void;
    onRetry?: (() => void) | undefined;
    onRegenerate?: (() => void) | undefined;
    onRefine?: ((body: string) => void) | undefined;
    onDescribe: () => void;
    onTranslateOther: () => void;
    onTranslate?: ((id: string) => void) | undefined;
    onSwap?: (() => void) | undefined;
    onTaskChange?: ((id: string) => void) | undefined;
    onToggleDetails: (open: boolean) => void;
    onToggleErrorDetails: () => void;
    onEscalate?: (() => void) | undefined;
    onOpenOptions?: ((tab?: SettingsTab) => void) | undefined;
  }
  const {
    tip,
    mode,
    task,
    views,
    swapDisabled,
    detailsOpen,
    errorDetailsOpen,
    hasErrorDetails,
    translateInto,
    canEscalate,
    escalationKind,
    changing,
    onCancel,
    onCopy,
    onRetry,
    onRegenerate,
    onRefine,
    onDescribe,
    onTranslateOther,
    onTranslate,
    onSwap,
    onTaskChange,
    onToggleDetails,
    onToggleErrorDetails,
    onEscalate,
    onOpenOptions,
  }: Props = $props();
  let toolbar: HTMLDivElement | undefined = $state();
  let refineOpen = $state(false);
  let moreOpen = $state(false);
  const refineFocus = outsidePressFocus();
  const moreFocus = outsidePressFocus();
  const busy = $derived(!tip.error && !tip.stopped && (tip.loading || tip.settled !== true));
  const canTranslate = $derived(taskCapabilities(task, views).answersIn === 'target');
  const optionsTab = $derived(
    tip.error ? optionsTabForMessage(tip.error.message, tip.error.code) : undefined,
  );
  const showRetry = $derived(
    !!onRetry &&
      (!tip.error ||
        tip.error.code === 'ABORTED' ||
        isRetryable(tip.error.code) ||
        optionsTab !== undefined),
  );
  const presets = $derived(taskCapabilities(task, views).refinePresets);
  const escalationInMore = $derived(
    mode === 'error' && optionsTab !== undefined && !!onOpenOptions && showRetry && !!tip.body,
  );
  const detailsInMore = $derived(mode === 'error' && optionsTab !== undefined && !!onOpenOptions);

  // An open shadow root also accepts page-dispatched events; those must never start a request.
  function guard(e: Event): void {
    if (isUserGesture(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function rerun(fn: (() => void) | undefined): void {
    if (busy) return;
    refineOpen = false;
    moreOpen = false;
    fn?.();
  }
  function menuKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    const trigger = toolbar?.querySelector<HTMLElement>(
      refineOpen ? '[aria-label="Refine"]' : '[aria-label="More"]',
    );
    refineOpen = false;
    moreOpen = false;
    void tick().then(() => trigger?.focus({ preventScroll: true }));
  }
</script>

<span class="ega-sr-only" role="status" aria-live="polite" aria-atomic="true" data-ega-copy-live
  >{tip.copied ? 'Copied' : ''}</span
>

{#snippet rerunItem(label: string, run: () => void)}
  <DropdownMenu.Item onSelect={() => rerun(run)} closeOnSelect={!busy}>
    {#snippet child({ props })}
      <div {...props} class="tooltip-menu-item" aria-disabled={busy ? 'true' : 'false'}>
        {label}{#if busy}<span class="ega-sr-only"> — Wait for the reply to finish.</span>{/if}
      </div>
    {/snippet}
  </DropdownMenu.Item>
{/snippet}

<div class="actions" data-ega-tooltip-actions bind:this={toolbar}>
  {#if mode === 'error'}
    {#if optionsTab !== undefined && onOpenOptions}
      <button
        class="tooltip-fix"
        data-ega-tooltip-error-cta
        onclick={(e) => {
          if (isUserGesture(e)) onOpenOptions?.(optionsTab);
        }}>Open settings</button
      >
    {/if}
    {#if showRetry}
      <button
        class="tooltip-text-action"
        data-ega-retry
        disabled={tip.retryBlocked}
        onclick={(e) => {
          if (isUserGesture(e)) onRetry?.();
        }}
      >
        {tip.retryBlocked && (tip.retryRemainingSec ?? 0) > 0
          ? 'Retry in ' + tip.retryRemainingSec + 's'
          : 'Retry'}
      </button>
    {/if}
    {#if tip.body}
      <button
        class="icon-btn"
        aria-label="Copy partial translation"
        data-tooltip={tip.copied ? 'Copied' : 'Copy'}
        onclick={onCopy}><Icon icon={tip.copied ? Check : Copy} size={16} /></button
      >
    {/if}
    {#if hasErrorDetails && !detailsInMore}
      <button
        class="tooltip-text-action"
        aria-expanded={errorDetailsOpen}
        onclick={onToggleErrorDetails}>Details {errorDetailsOpen ? '▾' : '▸'}</button
      >
    {/if}
    {#if canEscalate && onEscalate && !escalationInMore}
      <button
        class="icon-btn"
        aria-label="Open in side panel"
        data-ega-escalate={escalationKind}
        data-tooltip="Open in side panel"
        onclick={(e) => {
          if (isUserGesture(e)) onEscalate?.();
        }}><Icon icon={PanelRightOpen} size={16} /></button
      >
    {/if}
  {:else}
    {#if busy}<button class="tooltip-text-action" onclick={onCancel}>Stop</button>{/if}
    {#if tip.body}
      <button
        class="icon-btn"
        aria-label="Copy translation"
        data-tooltip={tip.copied ? 'Copied' : 'Copy'}
        onclick={onCopy}><Icon icon={tip.copied ? Check : Copy} size={16} /></button
      >
    {/if}
    {#if !busy && onRegenerate}
      <button
        class="icon-btn"
        aria-label="Regenerate"
        data-tooltip="Regenerate"
        onclick={(e) => {
          if (isUserGesture(e)) onRegenerate?.();
        }}><Icon icon={RotateCcw} size={16} /></button
      >
    {/if}
    {#if !busy && onRefine && !tip.imageUrl}
      <DropdownMenu.Root bind:open={refineOpen}>
        <DropdownMenu.Trigger
          class="icon-btn"
          aria-label="Refine"
          aria-pressed={changing || undefined}
          data-tooltip="Refine"
          onkeydowncapture={guard}
          onclickcapture={guard}
          onpointerdowncapture={guard}><Icon icon={WandSparkles} size={16} /></DropdownMenu.Trigger
        >
        <DropdownMenu.Portal
          {...toolbar?.parentElement ? { to: toolbar.parentElement } : { disabled: true }}
        >
          <DropdownMenu.Content
            class="tooltip-menu"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            preventScroll={false}
            {...refineFocus}
            onkeydowncapture={guard}
            onclickcapture={guard}
            onpointerdowncapture={guard}
            onkeydown={menuKey}
          >
            {#each presets as preset (preset.id)}{@render rerunItem(preset.label, () =>
                onRefine?.(preset.body),
              )}{/each}
            {@render rerunItem('Describe a change…', onDescribe)}
            {#if canTranslate && onTranslate}
              <DropdownMenu.Separator class="tooltip-menu-sep" />
              {#if translateInto !== null}{@const into = translateInto}{@render rerunItem(
                  'Translate into ' + into.label,
                  () => onTranslate?.(into.id),
                )}{/if}
              {@render rerunItem('Translate into another language…', onTranslateOther)}
              {#if onSwap}
                <DropdownMenu.Item
                  class="tooltip-menu-item"
                  onSelect={() => {
                    if (!swapDisabled) rerun(onSwap);
                  }}
                  closeOnSelect={!swapDisabled}
                >
                  {#snippet child({ props })}
                    <div {...props} class="tooltip-menu-item" aria-disabled={swapDisabled}>
                      {swapDisabled ? 'Swap — pick a source language first' : 'Swap'}
                    </div>
                  {/snippet}
                </DropdownMenu.Item>
              {/if}
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}
    {#if canEscalate && onEscalate}
      <button
        class="icon-btn"
        aria-label="Open in side panel"
        data-ega-escalate={escalationKind}
        data-tooltip="Open in side panel"
        onclick={(e) => {
          if (isUserGesture(e)) onEscalate?.();
        }}><Icon icon={PanelRightOpen} size={16} /></button
      >
    {/if}
  {/if}
  <DropdownMenu.Root bind:open={moreOpen}>
    <DropdownMenu.Trigger
      class="icon-btn"
      aria-label="More"
      data-tooltip="More"
      onkeydowncapture={guard}
      onclickcapture={guard}
      onpointerdowncapture={guard}><Icon icon={Ellipsis} size={16} /></DropdownMenu.Trigger
    >
    <DropdownMenu.Portal
      {...toolbar?.parentElement ? { to: toolbar.parentElement } : { disabled: true }}
    >
      <DropdownMenu.Content
        class="tooltip-menu"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        preventScroll={false}
        {...moreFocus}
        onkeydowncapture={guard}
        onclickcapture={guard}
        onpointerdowncapture={guard}
        onkeydown={menuKey}
      >
        <DropdownMenu.CheckboxItem
          class="tooltip-menu-item"
          checked={detailsOpen}
          onCheckedChange={onToggleDetails}
        >
          {#snippet children({ checked })}<span>About this reply</span>{#if checked}<Icon
                icon={Check}
                size={16}
              />{/if}{/snippet}
        </DropdownMenu.CheckboxItem>
        {#if hasErrorDetails && detailsInMore}
          <DropdownMenu.CheckboxItem
            class="tooltip-menu-item"
            checked={errorDetailsOpen}
            onCheckedChange={() => onToggleErrorDetails()}
          >
            {#snippet children({ checked })}<span>Error details</span>{#if checked}<Icon
                  icon={Check}
                  size={16}
                />{/if}{/snippet}
          </DropdownMenu.CheckboxItem>
        {/if}
        {#if escalationInMore && canEscalate && onEscalate}
          <DropdownMenu.Item class="tooltip-menu-item" onSelect={onEscalate}
            >Open in side panel</DropdownMenu.Item
          >
        {/if}
        {#if onTaskChange && !tip.imageUrl}
          <DropdownMenu.Separator class="tooltip-menu-sep" />
          <DropdownMenu.Group>
            <DropdownMenu.GroupHeading class="tooltip-menu-heading"
              >Answer again as</DropdownMenu.GroupHeading
            >
            {#each views.filter((v) => !v.disabled && v.id !== task) as view (view.id)}
              {@render rerunItem(answerAgainLabel(view.id, view.label), () =>
                onTaskChange?.(view.id),
              )}
            {/each}
          </DropdownMenu.Group>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>
