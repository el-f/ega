<script lang="ts">
  import { debugCatch } from '@/shared/logger';
  import ImagePreview from '@/shared/components/ImagePreview.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import Star from '@lucide/svelte/icons/star';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import { relativeTime } from '@/shared/relative-time';
  import { isImageTurn, turnLabel, type Turn } from '../state/conversation';
  import { SHIPPED_TASK_VIEWS, type TaskView } from '@/shared/task-view';
  import { TONE_LABELS } from '@/shared/task-prompts';
  import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';

  interface Props {
    turn: Turn;
    /** Every task, on or off; names a custom task and says whether its prompt has a tone. */
    taskViews?: readonly TaskView[] | undefined;
    /** True for the focused turn in the keyboard cycle; drives the focus ring. */
    focused?: boolean;
    onBookmark?: ((id: string) => void) | undefined;
    onDelete?: ((id: string) => void) | undefined;
    onEdit?: ((id: string) => void) | undefined;
    /** True while a reply is streaming; editing would truncate under the running turn. */
    inflight?: boolean;
    /** Clock the stream ticks, so the relative timestamp does not freeze at "just now". */
    now?: number;
  }

  const {
    turn,
    focused = false,
    onBookmark,
    onDelete,
    onEdit,
    inflight = false,
    now = Date.now(),
    taskViews = SHIPPED_TASK_VIEWS,
  }: Props = $props();

  // The marker is a render token, not text the user wrote — nothing to show and nothing to copy.
  const hasText = $derived(turn.content !== '' && turn.content !== IMAGE_TURN_PLACEHOLDER);

  // Tone is captured at send time, so a later picker change cannot retro-apply to this turn.
  const baseLabel = $derived(turnLabel(turn, taskViews));
  const usesTone = $derived(
    taskViews.find((v) => v.id === (turn.taskId ?? turn.kind))?.usesTone ?? turn.kind === 'reword',
  );
  const kindLabel = $derived(
    usesTone && turn.tone ? `${baseLabel} · ${TONE_LABELS[turn.tone]}` : baseLabel,
  );

  // `article` is not name-from-content, so without a label a j/k-focused turn is announced as a bare "article".
  const srLabel = $derived(`You · ${baseLabel} · ${relativeTime(turn.createdAt, now)}`);

  const actionKeys = $derived<readonly string[]>([
    ...(hasText ? ['copy'] : []),
    'bookmark',
    ...(!isImageTurn(turn) && !inflight ? ['edit'] : []),
    'delete',
  ]);

  let actionsEl: HTMLElement | null = $state(null);
  let pickedAction = $state('copy');

  // Clamped, not stored: the edit and details buttons come and go with the turn.
  const activeAction = $derived(
    actionKeys.includes(pickedAction) ? pickedAction : (actionKeys[0] ?? 'copy'),
  );

  // A click moves focus without touching pickedAction, so the next arrow would jump from the wrong button.
  function onActionsFocusIn(e: FocusEvent): void {
    const key = (e.target as HTMLElement | null)
      ?.closest('[data-ega-action]')
      ?.getAttribute('data-ega-action');
    if (key !== null && key !== undefined && actionKeys.includes(key)) pickedAction = key;
  }

  // One tab stop per turn instead of one per button; arrows move inside the row.
  function onActionsKeydown(e: KeyboardEvent): void {
    const idx = actionKeys.indexOf(activeAction);
    let next: number;
    if (e.key === 'ArrowRight') next = (idx + 1) % actionKeys.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + actionKeys.length) % actionKeys.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = actionKeys.length - 1;
    else return;
    e.preventDefault();
    // The window handler would take the same key and move focus to another turn.
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
  tabindex="-1"
  aria-label={srLabel}
  data-turn-id={turn.id}
>
  <header class="ega-user-meta">
    <span class="ega-kind-badge">{kindLabel}</span>
    <time
      class="ega-timestamp"
      data-ega-timestamp
      datetime={new Date(turn.createdAt).toISOString()}
      data-tooltip={new Date(turn.createdAt).toLocaleString()}
      data-tooltip-placement="top">{relativeTime(turn.createdAt, now)}</time
    >
  </header>
  {#if turn.imageDataUrl}
    <ImagePreview src={turn.imageDataUrl} alt="Your image" />
  {:else if turn.kind === 'image-translate' || turn.content === IMAGE_TURN_PLACEHOLDER}
    <span class="ega-user-image-missing">Image not shown</span>
  {/if}
  {#if hasText}
    <!-- dir=auto: Arabic/Hebrew content in an LTR panel must align by its own first strong character. -->
    <div class="ega-user-text" dir="auto">{turn.content}</div>
  {/if}
  {#if turn.trimmedTo !== undefined}
    <span class="ega-user-trimmed">Only the first {turn.trimmedTo} characters were sent.</span>
  {/if}
  <div
    class="ega-turn-actions"
    role="toolbar"
    tabindex="-1"
    aria-label="Message actions"
    bind:this={actionsEl}
    onfocusin={onActionsFocusIn}
    onkeydown={onActionsKeydown}
  >
    {#if hasText}
      <span class="ega-copy-btn-wrap" class:is-copied={copied}>
        <IconButton
          icon={copied ? Check : Copy}
          ariaLabel={copied ? 'Copied' : 'Copy source text'}
          size="sm"
          dataAttrs={{
            'data-ega-copy-source': 'true',
            'data-ega-action': 'copy',
            tabindex: activeAction === 'copy' ? 0 : -1,
          }}
          onclick={() => void copySource()}
        />
      </span>
    {/if}
    <IconButton
      icon={Star}
      ariaLabel={turn.bookmarked ? 'Remove bookmark' : 'Bookmark this message'}
      size="sm"
      dataAttrs={{
        'data-ega-bookmark': 'true',
        'aria-pressed': String(turn.bookmarked === true),
        'data-ega-action': 'bookmark',
        tabindex: activeAction === 'bookmark' ? 0 : -1,
      }}
      onclick={() => onBookmark?.(turn.id)}
    />
    {#if !isImageTurn(turn)}
      <!-- The composer holds no image, so editing an image turn would send the "[image]" marker as text. -->
      <IconButton
        icon={Pencil}
        ariaLabel={inflight ? 'Edit when this reply finishes' : 'Edit this message'}
        disabled={inflight}
        size="sm"
        dataAttrs={{
          'data-ega-edit': 'true',
          'data-ega-action': 'edit',
          tabindex: activeAction === 'edit' ? 0 : -1,
        }}
        onclick={() => onEdit?.(turn.id)}
      />
    {/if}
    <IconButton
      icon={Trash2}
      ariaLabel="Delete this message and its reply"
      size="sm"
      variant="danger"
      dataAttrs={{
        'data-ega-delete': 'true',
        'data-ega-action': 'delete',
        tabindex: activeAction === 'delete' ? 0 : -1,
      }}
      onclick={() => onDelete?.(turn.id)}
    />
  </div>
</article>

<style>
  .ega-user-turn {
    align-self: flex-end;
    max-width: 85%;
    padding: var(--space-2) var(--space-3);
    /* Transparent, not none: forced colors repaints it, so the bubble keeps its box when the tint goes. */
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--color-accent-bg-soft);
    color: var(--color-fg);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    /* Matches the stream's own right-edge padding, so the card never overflows its row. */
    min-width: 0;
    max-inline-size: calc(100% - var(--space-3));
  }
  .ega-user-turn.focused {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .ega-user-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ega-kind-badge {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    /* accent lands under 4.5:1 on the soft accent tint; accent-hover clears it in both themes. */
    color: var(--color-accent-hover);
    font-weight: 600;
  }
  .ega-timestamp {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    margin-left: auto;
  }
  .ega-user-image-missing,
  .ega-user-trimmed {
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .ega-user-text {
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* Always visible; buttons rest muted (IconButton default) and gain emphasis per button on hover/focus. */
  .ega-turn-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 28px;
    margin-top: var(--space-1);
  }
  .ega-copy-btn-wrap {
    display: inline-flex;
    border-radius: var(--radius-sm);
  }
  .ega-copy-btn-wrap.is-copied {
    animation: ega-success-pulse 600ms ease-out;
  }
  @keyframes ega-success-pulse {
    0% {
      box-shadow: 0 0 0 0 var(--color-success-bg-soft, rgba(0 200 0 / 0.3));
    }
    100% {
      box-shadow: 0 0 0 6px transparent;
    }
  }
</style>
