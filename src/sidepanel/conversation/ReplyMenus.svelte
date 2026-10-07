<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import Icon from '@/shared/ui/Icon.svelte';
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Check from '@lucide/svelte/icons/check';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import CircleStop from '@lucide/svelte/icons/circle-stop';
  import Star from '@lucide/svelte/icons/star';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { RefinePreset } from '../state/refine-presets';

  interface Props {
    turnId: string;
    /** Roving tab stops, owned by the reply's toolbar. */
    refineTab: number;
    moreTab: number;
    /** False when the reply has no send to replay: the Refine menu is not shown. */
    canRerun: boolean;
    /** Another reply runs, so a re-run would bail: the items stay, marked, with the reason. */
    busy: boolean;
    presets: readonly RefinePreset[];
    /** False on an image reply: the image prompt takes no typed change. */
    canDescribe: boolean;
    /** False when the reply's task keeps the input's language (Reword, Grammar): no language items. */
    canTranslate: boolean;
    /** The composer's target, when it differs from this reply's language. */
    translateInto: { id: string; label: string } | null;
    /** "Swap: English → Spanish", or null when no swap can run. */
    swapLabel: string | null;
    /** A refined version: "Show changes" applies. */
    refined: boolean;
    showChanges: boolean;
    /** Describe a change is open for this reply. */
    changing: boolean;
    speakable: boolean;
    speaking: boolean;
    aboutOpen: boolean;
    answerAgain: readonly { id: string; label: string }[];
    bookmarked: boolean;
    onPreset: (p: RefinePreset) => void;
    onDescribeChange: () => void;
    onTranslateInto: (lang: string) => void;
    /** Opens the language popover, which the reply renders outside its toolbar. */
    onTranslateOther: () => void;
    onSwap: () => void;
    onShowChanges: (on: boolean) => void;
    onSpeak: () => void;
    onAbout: (open: boolean) => void;
    onAnswerAgain: (task: string) => void;
    onBookmark: () => void;
    onDelete: () => void;
  }

  const {
    turnId,
    refineTab,
    moreTab,
    canRerun,
    busy,
    presets,
    canDescribe,
    canTranslate,
    translateInto,
    swapLabel,
    refined,
    showChanges,
    changing,
    speakable,
    speaking,
    aboutOpen,
    answerAgain,
    bookmarked,
    onPreset,
    onDescribeChange,
    onTranslateInto,
    onTranslateOther,
    onSwap,
    onShowChanges,
    onSpeak,
    onAbout,
    onAnswerAgain,
    onBookmark,
    onDelete,
  }: Props = $props();

  let refineOpen = $state(false);
  let moreOpen = $state(false);
  const busyNote = $derived(`rm-busy-${turnId}`);

  /** A re-run while another reply runs would bail, so the item says why instead of doing nothing silently. */
  function rerun(fn: () => void): void {
    if (busy) return;
    refineOpen = false;
    moreOpen = false;
    fn();
  }
</script>

{#snippet busyLine()}
  {#if busy}
    <p class="sp-menu-note" id={busyNote}>Wait for the current reply to finish.</p>
  {/if}
{/snippet}

<!-- Not bits' disabled: that drops the item from the arrow keys, and a busy item must still be read with its reason. -->
{#snippet rerunItem(
  label: string,
  run: () => void,
  attrs: Record<string, string>,
  indent: boolean = false,
)}
  <DropdownMenu.Item closeOnSelect={!busy} onSelect={() => rerun(run)}>
    {#snippet child({ props })}
      <div
        {...props}
        {...attrs}
        class="sp-menu-item"
        aria-disabled={busy ? 'true' : 'false'}
        aria-describedby={busy ? busyNote : undefined}
      >
        {#if indent}<span class="sp-menu-icon-slot" aria-hidden="true"></span>{/if}
        <span class="sp-menu-label">{label}</span>
      </div>
    {/snippet}
  </DropdownMenu.Item>
{/snippet}

{#if canRerun}
  <DropdownMenu.Root bind:open={refineOpen}>
    <DropdownMenu.Trigger
      class="ega-icon-btn variant-default size-sm"
      aria-label="Refine"
      aria-pressed={changing ? 'true' : undefined}
      data-tooltip="Refine"
      data-tooltip-placement="top"
      data-ega-action="refine"
      data-ega-refine-menu
      tabindex={refineTab}
    >
      <Icon icon={WandSparkles} size={16} />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        preventScroll={false}
        collisionPadding={12}
        class="sp-menu"
        align="start"
        sideOffset={6}
      >
        {@render busyLine()}
        {#each presets as p (p.id)}
          {@render rerunItem(p.label, () => onPreset(p), { 'data-ega-refine-preset': p.id })}
        {/each}
        {#if canDescribe}
          {@render rerunItem('Describe a change…', onDescribeChange, {
            'data-ega-describe-change': '',
          })}
        {/if}
        {#if canTranslate}
          {#if canDescribe}<DropdownMenu.Separator class="sp-menu-sep" />{/if}
          {#if translateInto !== null}
            {@const into = translateInto}
            {@render rerunItem(`Translate into ${into.label}`, () => onTranslateInto(into.id), {
              'data-ega-translate-into': into.id,
            })}
          {/if}
          {@render rerunItem('Translate into another language…', onTranslateOther, {
            'data-ega-translate-into-other': '',
            'aria-haspopup': 'dialog',
          })}
          {#if swapLabel !== null}
            {@render rerunItem(swapLabel, onSwap, { 'data-ega-swap-item': '' })}
          {/if}
        {/if}
        {#if refined}
          <DropdownMenu.Separator class="sp-menu-sep" />
          <DropdownMenu.CheckboxItem
            class="sp-menu-item"
            checked={showChanges}
            onCheckedChange={(v) => onShowChanges(v)}
            data-ega-show-changes
          >
            {#snippet children({ checked })}
              <span class="sp-menu-label">Show changes</span>
              {#if checked}<Icon icon={Check} size={16} />{/if}
            {/snippet}
          </DropdownMenu.CheckboxItem>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
{/if}

<DropdownMenu.Root bind:open={moreOpen}>
  <DropdownMenu.Trigger
    class="ega-icon-btn variant-default size-sm"
    aria-label="More"
    data-tooltip="More"
    data-tooltip-placement="top"
    data-ega-action="more"
    tabindex={moreTab}
  >
    <Icon icon={Ellipsis} size={16} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      preventScroll={false}
      collisionPadding={12}
      class="sp-menu"
      align="start"
      sideOffset={6}
    >
      {#if speakable}
        <DropdownMenu.Item class="sp-menu-item" onSelect={onSpeak} data-ega-speak>
          <Icon icon={speaking ? CircleStop : Volume2} size={16} />
          <span class="sp-menu-label">{speaking ? 'Stop reading' : 'Read aloud'}</span>
        </DropdownMenu.Item>
      {/if}
      <DropdownMenu.CheckboxItem
        class="sp-menu-item"
        checked={aboutOpen}
        onCheckedChange={(v) => onAbout(v)}
        data-ega-about
      >
        {#snippet children({ checked })}
          {#if speakable}<span class="sp-menu-icon-slot" aria-hidden="true"></span>{/if}
          <span class="sp-menu-label">About this reply</span>
          {#if checked}<Icon icon={Check} size={16} />{/if}
        {/snippet}
      </DropdownMenu.CheckboxItem>
      {#if answerAgain.length > 0}
        <DropdownMenu.Separator class="sp-menu-sep" />
        <DropdownMenu.Group aria-labelledby="rm-again-{turnId}">
          <DropdownMenu.GroupHeading
            class="sp-menu-heading sp-menu-heading-indent"
            id="rm-again-{turnId}">Answer again as</DropdownMenu.GroupHeading
          >
          {@render busyLine()}
          {#each answerAgain as t (t.id)}
            {@render rerunItem(
              t.label,
              () => onAnswerAgain(t.id),
              { 'data-ega-answer-again': t.id },
              true,
            )}
          {/each}
        </DropdownMenu.Group>
      {/if}
      <DropdownMenu.Separator class="sp-menu-sep" />
      <DropdownMenu.CheckboxItem
        class="sp-menu-item"
        checked={bookmarked}
        onCheckedChange={onBookmark}
        data-ega-bookmark
      >
        {#snippet children({ checked })}
          <Icon icon={Star} size={16} />
          <span class="sp-menu-label">Bookmark</span>
          {#if checked}<Icon icon={Check} size={16} />{/if}
        {/snippet}
      </DropdownMenu.CheckboxItem>
      <!-- Last, not first: a keyboard open lands on the first item, and a second Enter must not delete. -->
      <DropdownMenu.Item class="sp-menu-item sp-menu-danger" onSelect={onDelete} data-ega-delete>
        <Icon icon={Trash2} size={16} />
        <span class="sp-menu-label">Delete</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
