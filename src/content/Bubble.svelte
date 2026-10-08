<script lang="ts">
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import { isUserGesture } from './user-gesture';
  import { languageName } from './language-name';

  interface Direction {
    source: string;
    target: string;
  }

  interface Props {
    left: number;
    top: number;
    queued: number;
    /** Current translation direction; the label names its target. */
    direction?: Direction;
    /** The default task's name when it is not Translate: the bubble runs that task, so it says so. */
    task?: string;
    /** Plays a 3-ring pulse once, on the first bubble of this install; the parent stores the seen flag. */
    firstRun?: boolean;
    /** `left` is the right edge on a right-to-left block. */
    rtl?: boolean;
    onclick: (e: MouseEvent) => void;
    /** Opens the menu under the chevron; `viaKeyboard` moves focus into it, `returnTo` is where focus was before the bubble. */
    onmenu: (
      chevron: HTMLButtonElement,
      viaKeyboard: boolean,
      returnTo: HTMLElement | null | undefined,
    ) => void;
  }
  let {
    left,
    top,
    queued,
    direction,
    task,
    firstRun = false,
    rtl = false,
    onclick,
    onmenu,
  }: Props = $props();

  // Where focus was before it entered the bubble. A move from its own segments, or from Ega's own UI around it
  // (the menu, the tooltip: the same shadow root), keeps it, so an Esc out of the menu never forgets the page.
  let focusedFrom: HTMLElement | null | undefined;
  function onFocusIn(e: FocusEvent): void {
    const from = e.relatedTarget;
    const group = e.currentTarget as HTMLElement;
    const root = group.getRootNode();
    if (
      from instanceof Node &&
      (group.contains(from) || (root instanceof ShadowRoot && from.getRootNode() === root))
    ) {
      return;
    }
    focusedFrom = from instanceof HTMLElement ? from : null;
  }

  // The source is left out, so nothing dangles; the tooltip names it.
  const label = $derived.by(() => {
    const count = queued > 0 ? ` ${queued + 1}` : '';
    if (task) return `${task}${count}`;
    return direction
      ? `Translate${count} to ${languageName(direction.target)}`
      : `Translate${count}`;
  });
</script>

<!-- mousedown must not steal focus: the editable-selection re-read needs the field to stay activeElement. -->
<div
  class="bubble-group"
  class:is-first-run={firstRun}
  class:is-rtl={rtl}
  style:left="{left}px"
  style:top="{top}px"
  data-queued={queued}
  onfocusin={onFocusIn}
>
  <button
    type="button"
    class="bubble"
    onmousedown={(e) => e.preventDefault()}
    onclick={(e) => {
      e.preventDefault();
      if (!isUserGesture(e)) return;
      // A keyboard click (detail 0) unmounts the focused button, so focus goes back first; the tooltip restores to it.
      if (!e.detail) focusedFrom?.focus();
      onclick(e);
    }}
  >
    <BrandMark size={16} label="" />
    <span class="bubble-label" data-ega-truncates>{label}</span>
  </button>
  <button
    type="button"
    class="bubble-more"
    aria-label="Bubble options"
    aria-haspopup="menu"
    aria-expanded="false"
    onmousedown={(e) => e.preventDefault()}
    onclick={(e) => {
      e.preventDefault();
      if (!isUserGesture(e)) return;
      onmenu(e.currentTarget, e.detail === 0, focusedFrom);
    }}
    onkeydown={(e) => {
      if (e.key !== 'ArrowDown' || !isUserGesture(e)) return;
      e.preventDefault();
      onmenu(e.currentTarget, true, focusedFrom);
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
  </button>
</div>
