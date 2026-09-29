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
</script>

<!-- mousedown must not steal focus: the editable-selection re-read needs the field to stay activeElement. -->
<button
  class="bubble"
  class:is-first-run={firstRun}
  style:left="{left}px"
  style:top="{top}px"
  onmousedown={(e) => e.preventDefault()}
  onclick={(e) => {
    e.preventDefault();
    if (isUserGesture(e)) onclick(e);
  }}
  title={queued > 0
    ? `Translate (+${queued} queued). Shift-click to queue another.`
    : 'Translate with Ega — Shift-click to queue multiple selections'}
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
