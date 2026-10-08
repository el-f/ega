<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { debugCatch } from '@/shared/logger';
  import ImagePreview from '@/shared/components/ImagePreview.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import Star from '@lucide/svelte/icons/star';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { isImageTurn, type Turn } from '../state/conversation';
  import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
  import { outsidePressFocus } from './menu-focus';

  interface Props {
    turn: Turn;
    /** The task this message names above its bubble, only where the task changes. */
    taskLabel?: string | undefined;
    /** A day separator sits right above this message. */
    afterSeparator?: boolean;
    /** True for the focused turn in the keyboard cycle; drives the focus ring. */
    focused?: boolean;
    /** The newest message edits in place; an older one edits "from here", removing what came after. */
    latest?: boolean;
    /** Messages after this one, named by "Edit from here". */
    laterCount?: number;
    /** This message is in the composer, being edited. */
    editing?: boolean;
    /** The pair is bookmarked, from either half; defaults to this message's own flag. */
    bookmarked?: boolean | undefined;
    onBookmark?: ((id: string) => void) | undefined;
    onDelete?: ((id: string) => void) | undefined;
    onEdit?: ((id: string) => void) | undefined;
    /** True while a reply is streaming; editing would truncate under the running turn. */
    inflight?: boolean;
  }

  const {
    turn,
    taskLabel,
    afterSeparator = false,
    focused = false,
    latest = false,
    laterCount = 0,
    editing = false,
    bookmarked,
    onBookmark,
    onDelete,
    onEdit,
    inflight = false,
  }: Props = $props();
  const menuFocus = outsidePressFocus();

  // The marker is a render token, not text the user wrote: nothing to show and nothing to copy.
  const hasText = $derived(turn.content !== '' && turn.content !== IMAGE_TURN_PLACEHOLDER);
  // The time moved to the day separators, so the name is the text itself.
  const srLabel = $derived(
    `You: ${hasText ? Array.from(turn.content).slice(0, 60).join('') : 'Image'}`,
  );
  // Hidden, not disabled, while a reply streams: a disabled button cannot take focus to say why.
  const canEdit = $derived(!isImageTurn(turn) && !inflight);
  const editLabel = $derived(latest ? 'Edit' : 'Edit from here');
  const editTip = $derived(
    latest
      ? 'Edit'
      : `Edit from here (removes ${laterCount} later ${laterCount === 1 ? 'message' : 'messages'})`,
  );

  const actionKeys = $derived<readonly string[]>([
    ...(hasText ? ['copy'] : []),
    ...(canEdit ? ['edit'] : []),
    'more',
  ]);
  let actionsEl: HTMLElement | null = $state(null);
  let pickedAction = $state('copy');
  const activeAction = $derived(
    actionKeys.includes(pickedAction) ? pickedAction : (actionKeys[0] ?? 'more'),
  );
  const tab = (key: string): number => (activeAction === key ? 0 : -1);

  function onActionsFocusIn(e: FocusEvent): void {
    const key = (e.target as HTMLElement | null)
      ?.closest('[data-ega-action]')
      ?.getAttribute('data-ega-action');
    if (key !== null && key !== undefined && actionKeys.includes(key)) pickedAction = key;
  }

  // One tab stop per toolbar; arrows move inside it.
  function onActionsKeydown(e: KeyboardEvent): void {
    const idx = actionKeys.indexOf(activeAction);
    let next: number;
    if (e.key === 'ArrowRight') next = (idx + 1) % actionKeys.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + actionKeys.length) % actionKeys.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = actionKeys.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    const key = actionKeys[next];
    if (key === undefined) return;
    pickedAction = key;
    actionsEl?.querySelector<HTMLElement>(`[data-ega-action='${key}']`)?.focus();
  }

  let copied = $state(false);
  async function copySource(): Promise<void> {
    if (!hasText) return;
    try {
      await navigator.clipboard.writeText(turn.content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      debugCatch(e, 'sidepanel.conversation.UserTurn.copySource');
    }
  }
</script>

<article
  class="ega-user-turn"
  class:focused
  class:after-sep={afterSeparator}
  tabindex="-1"
  aria-label={srLabel}
  data-turn-id={turn.id}
  data-ega-user-turn
>
  {#if taskLabel !== undefined}
    <p class="ega-task-label">{taskLabel}</p>
  {/if}
  <div class="ega-bubble-wrap">
    <div class="ega-bubble" class:editing data-ega-user-bubble>
      {#if turn.imageDataUrl}
        <ImagePreview src={turn.imageDataUrl} alt="Your image" />
      {:else if isImageTurn(turn)}
        <!-- A dropped image keeps any typed note as the text, so the note alone would hide that an image was sent. -->
        <span class="ega-bubble-note">Image not shown</span>
      {/if}
      {#if hasText}
        <!-- dir=auto: Arabic or Hebrew in an LTR panel aligns by its own first strong character. -->
        <div class="ega-user-text" dir="auto">{turn.content}</div>
      {/if}
      {#if turn.trimmedTo !== undefined}
        <span class="ega-bubble-note ega-user-trimmed"
          >Only the first {turn.trimmedTo} characters were sent.</span
        >
      {/if}
    </div>
    <div
      class="ega-user-toolbar"
      role="toolbar"
      tabindex="-1"
      aria-label="Message actions"
      data-ega-user-toolbar
      bind:this={actionsEl}
      onfocusin={onActionsFocusIn}
      onkeydown={onActionsKeydown}
    >
      {#if hasText}
        <IconButton
          icon={copied ? Check : Copy}
          ariaLabel={copied ? 'Copied' : 'Copy'}
          size="sm"
          dataAttrs={{
            'data-ega-copy-source': 'true',
            'data-ega-action': 'copy',
            tabindex: tab('copy'),
          }}
          onclick={() => void copySource()}
        />
      {/if}
      {#if canEdit}
        <!-- The composer holds no image, so editing an image turn would send the "[image]" marker as text. -->
        <IconButton
          icon={Pencil}
          ariaLabel={editLabel}
          tooltip={editTip}
          size="sm"
          dataAttrs={{ 'data-ega-edit': 'true', 'data-ega-action': 'edit', tabindex: tab('edit') }}
          onclick={() => onEdit?.(turn.id)}
        />
      {/if}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="ega-icon-btn variant-default size-sm"
          aria-label="More"
          data-tooltip="More"
          data-tooltip-placement="top"
          data-ega-action="more"
          tabindex={tab('more')}
        >
          <Icon icon={Ellipsis} size={16} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            {...menuFocus}
            preventScroll={false}
            collisionPadding={12}
            class="sp-menu"
            align="end"
            sideOffset={6}
          >
            <DropdownMenu.CheckboxItem
              class="sp-menu-item"
              checked={bookmarked ?? turn.bookmarked === true}
              onCheckedChange={() => onBookmark?.(turn.id)}
              data-ega-bookmark
            >
              {#snippet children({ checked })}
                <Icon icon={Star} size={16} />
                <span class="sp-menu-label">Bookmark</span>
                {#if checked}<Icon icon={Check} size={16} />{/if}
              {/snippet}
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Item
              class="sp-menu-item sp-menu-danger"
              onSelect={() => onDelete?.(turn.id)}
              data-ega-delete
            >
              <Icon icon={Trash2} size={16} />
              <span class="sp-menu-label">Delete</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  </div>
</article>

<style>
  .ega-user-turn {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-inline-size: 0;
    border-radius: var(--radius-lg);
  }
  /* The ring hugs the bubble: the article spans the row, so a ring on it draws an empty box. */
  .ega-user-turn:focus-visible {
    outline: none;
  }
  .ega-user-turn.focused .ega-bubble,
  .ega-user-turn:focus-visible .ega-bubble {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-task-label {
    margin: 0 0 var(--space-1);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .ega-bubble-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    max-inline-size: 85%;
    min-inline-size: 0;
  }
  .ega-bubble {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: var(--space-2) var(--space-3);
    /* Transparent, not none: forced colors repaints it, so the bubble keeps its box. */
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .ega-bubble.editing {
    outline: 2px solid var(--color-accent);
    outline-offset: 0;
  }
  .ega-user-text {
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ega-bubble-note {
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .ega-user-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  /* Pointer devices: a toolbar floats over the bubble's top edge, out of flow, so nothing moves. */
  @media (hover: hover) {
    .ega-user-toolbar {
      position: absolute;
      inset-block-start: calc(-1 * var(--space-5));
      inset-inline-end: var(--space-2);
      z-index: 2;
      padding: var(--space-1);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-bg-elevated);
      box-shadow: 0 2px 8px var(--color-shadow-soft);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--motion-fast) var(--ease-out);
    }
    /* D55: the toolbar rises 24px over the bubble, so text right above it (task label, day separator) keeps that room. */
    .ega-task-label {
      margin-block-end: 0;
    }
    .ega-task-label + .ega-bubble-wrap {
      margin-block-start: var(--space-5);
    }
    .ega-user-turn.after-sep > .ega-bubble-wrap:first-child {
      margin-block-start: calc(var(--space-5) - var(--space-2));
    }
    .ega-user-turn:hover .ega-user-toolbar,
    .ega-user-turn:focus-within .ega-user-toolbar,
    .ega-user-toolbar:has(:global([aria-expanded='true'])) {
      opacity: 1;
      pointer-events: auto;
    }
  }
  /* Touch: the row sits under the bubble, always shown. */
  @media (hover: none) {
    .ega-user-toolbar {
      margin-block-start: var(--space-1);
    }
  }
</style>
