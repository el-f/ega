<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    left: number;
    top: number;
    /** Keyboard opens put focus on the first item; a pointer open keeps it on the chevron. */
    focusFirst: boolean;
    onTurnOff: () => void;
    onSettings: () => void;
    /** `returnFocus`: Esc puts focus back on the chevron; Tab and outside clicks let it go where it was going. */
    onClose: (returnFocus: boolean) => void;
  }
  let { left, top, focusFirst, onTurnOff, onSettings, onClose }: Props = $props();

  let menu: HTMLDivElement | null = $state(null);

  function items(): HTMLButtonElement[] {
    return [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  }

  function move(e: KeyboardEvent): void {
    const all = items();
    const at = all.indexOf(e.target as HTMLButtonElement);
    let next: number;
    if (e.key === 'ArrowDown') next = (at + 1) % all.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      return;
    } else if (e.key === 'Tab') {
      onClose(false);
      return;
    } else return;
    e.preventDefault();
    all[next]?.focus();
  }

  onMount(() => {
    if (focusFirst) items()[0]?.focus();
    // Events from inside the shadow root reach the document retargeted to the host, so check the composed path.
    const outside = (e: PointerEvent): void => {
      const path = e.composedPath();
      const onChevron = path.some(
        (n) => n instanceof Element && n.classList.contains('bubble-more'),
      );
      if (menu && !path.includes(menu) && !onChevron) onClose(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  });
</script>

<div
  bind:this={menu}
  class="bubble-menu"
  role="menu"
  aria-label="Bubble options"
  tabindex="-1"
  style:left="{left}px"
  style:top="{top}px"
  onkeydown={move}
>
  <button
    type="button"
    role="menuitem"
    tabindex="-1"
    onmousedown={(e) => e.preventDefault()}
    onclick={onTurnOff}>Turn off on this site</button
  >
  <button
    type="button"
    role="menuitem"
    tabindex="-1"
    onmousedown={(e) => e.preventDefault()}
    onclick={onSettings}>Bubble settings</button
  >
</div>
