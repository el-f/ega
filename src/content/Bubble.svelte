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
    /** Current translation direction. When present, a small `source→target` tag renders inside the bubble. */
    direction?: Direction;
    /** Plays a 3-ring pulse once, on the first bubble of this install; the parent stores the seen flag. */
    firstRun?: boolean;
    onclick: (e: MouseEvent) => void;
  }
  let { left, top, queued, direction, firstRun = false, onclick }: Props = $props();

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
  // An undetected source adds nothing, so only the target shows.
  const directionText = $derived.by(() => {
    if (!direction) return '';
    const target = languageName(direction.target);
    return direction.source === 'auto'
      ? `→ ${target}`
      : `${languageName(direction.source)} → ${target}`;
  });
</script>

<!-- mousedown must not steal focus: the editable-selection re-read needs the field to stay activeElement. -->
<button
  class="bubble"
  class:is-first-run={firstRun}
  style:left="{left}px"
  style:top="{top}px"
  onmousedown={(e) => e.preventDefault()}
  onfocus={(e) => (focusedFrom = e.relatedTarget as HTMLElement | null)}
  onclick={(e) => {
    e.preventDefault();
    if (!isUserGesture(e)) return;
    // A keyboard click (detail 0) unmounts the focused button, so focus goes back first; the tooltip restores to it.
    if (!e.detail) focusedFrom?.focus();
    onclick(e);
  }}
  aria-label="Translate with Ega"
  title="{queued > 0 ? `${queued} queued. ` : ''}Shift-click to queue more"
>
  <BrandMark size={16} />
  {#if queued > 0}
    <span class="badge">+{queued}</span>
  {/if}
  {#if directionText}
    <span class="direction" aria-hidden="true">{directionText}</span>
  {/if}
</button>
