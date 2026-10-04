<script lang="ts">
  import BrandMark from '@/shared/components/BrandMark.svelte';
  import { isUserGesture } from './user-gesture';

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
  {#if direction}
    <span class="direction" aria-hidden="true">
      {direction.source}→{direction.target}
    </span>
  {/if}
</button>
