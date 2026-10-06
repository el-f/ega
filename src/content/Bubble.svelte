<script lang="ts">
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import { isUserGesture } from './user-gesture';
  import { varietyLabel } from './tooltip/variety-label';
  import { cachedCustomLanguages } from './customs-cache';

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
    /** Plays a 3-ring pulse once, on the first bubble of this install; the parent stores the seen flag. */
    firstRun?: boolean;
    onclick: (e: MouseEvent) => void;
    /** Opens the bubble's menu under the chevron; `viaKeyboard` moves focus into it. */
    onmenu: (chevron: HTMLButtonElement, viaKeyboard: boolean) => void;
  }
  let { left, top, queued, direction, firstRun = false, onclick, onmenu }: Props = $props();

  let focusedFrom: HTMLElement | null | undefined;

  // A raw id (`en`, a custom UUID) means nothing to a reader; the browser names ISO codes at no bundle cost.
  const isoNames = new Intl.DisplayNames(['en'], { type: 'language' });
  function languageName(id: string): string {
    const label = varietyLabel(id, cachedCustomLanguages());
    if (label !== id) return label;
    try {
      return isoNames.of(id) ?? id;
    } catch {
      return id;
    }
  }
  // The source is left out, so nothing dangles; the tooltip names it.
  const label = $derived.by(() => {
    const count = queued > 0 ? ` ${queued + 1}` : '';
    return direction
      ? `Translate${count} to ${languageName(direction.target)}`
      : `Translate${count}`;
  });
</script>

<!-- mousedown must not steal focus: the editable-selection re-read needs the field to stay activeElement. -->
<div
  class="bubble-group"
  class:is-first-run={firstRun}
  style:left="{left}px"
  style:top="{top}px"
  data-queued={queued}
>
  <button
    type="button"
    class="bubble"
    onmousedown={(e) => e.preventDefault()}
    onfocus={(e) => (focusedFrom = e.relatedTarget as HTMLElement | null)}
    onclick={(e) => {
      e.preventDefault();
      if (!isUserGesture(e)) return;
      // A keyboard click (detail 0) unmounts the focused button, so focus goes back first; the tooltip restores to it.
      if (!e.detail) focusedFrom?.focus();
      onclick(e);
    }}
  >
    <BrandMark size={16} label="" />
    <span class="bubble-label">{label}</span>
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
      onmenu(e.currentTarget, e.detail === 0);
    }}
    onkeydown={(e) => {
      if (e.key !== 'ArrowDown' || !isUserGesture(e)) return;
      e.preventDefault();
      onmenu(e.currentTarget, true);
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
  </button>
</div>
