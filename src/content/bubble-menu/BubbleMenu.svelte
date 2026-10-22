<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { isUserGesture } from '../user-gesture';
  import type { MenuTask } from './index';

  interface Props {
    left: number;
    top: number;
    /** Keyboard opens put focus on the first item; a pointer open keeps it on the chevron. */
    focusFirst: boolean;
    /** The tasks Run task lists; none hides the item. */
    tasks: readonly MenuTask[];
    /** The Run task list opens on the menu's left, because the right has no room. */
    subOnLeft: boolean;
    onRunTask: (id: string) => void;
    onTurnOff: () => void;
    onSettings: () => void;
    /** `returnFocus`: Esc puts focus back on the chevron; Tab and outside clicks let it go where it was going. */
    onClose: (returnFocus: boolean) => void;
  }
  let {
    left,
    top,
    focusFirst,
    tasks,
    subOnLeft,
    onRunTask,
    onTurnOff,
    onSettings,
    onClose,
  }: Props = $props();

  let menu: HTMLDivElement | null = $state(null);
  let sub: HTMLDivElement | null = $state(null);
  let parent: HTMLButtonElement | null = $state(null);
  let subOpen = $state(false);
  /** Moves the Run task list so all of it stays on screen. */
  let subShift = $state({ x: 0, y: 0 });

  function items(list: HTMLElement | null): HTMLButtonElement[] {
    if (!list) return [];
    // Only this menu's own items: the Run task list sits inside the main menu.
    return [...list.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter(
      (i) => i.closest('[role="menu"]') === list,
    );
  }

  async function openSub(focus: boolean): Promise<void> {
    if (!subOpen) {
      subShift = { x: 0, y: 0 };
      subOpen = true;
      await tick();
      const r = sub?.getBoundingClientRect();
      const p = parent?.getBoundingClientRect();
      if (r && p) {
        const x = r.left < 8 ? 8 - r.left : Math.min(0, window.innerWidth - 8 - r.right);
        // Too narrow for either side: the list drops below Run task instead of covering it.
        const overlaps = r.left + x < p.right && r.right + x > p.left;
        const room = window.innerHeight - 8 - r.bottom;
        subShift = { x, y: Math.min(overlaps ? p.height + 4 : 0, room) };
      }
    }
    if (focus) items(sub)[0]?.focus();
  }

  /** Focus inside the list goes back to Run task, so it never drops to the page when the list unmounts. */
  function closeSub(focusParent: boolean): void {
    const root = menu?.getRootNode() as ShadowRoot | Document | undefined;
    const hadFocus = sub?.contains(root?.activeElement ?? null) === true;
    subOpen = false;
    if (focusParent || hadFocus) parent?.focus();
  }

  function move(e: KeyboardEvent): void {
    const inSub = sub?.contains(e.target as Node) === true;
    const all = items(inSub ? sub : menu);
    const at = all.indexOf(e.target as HTMLButtonElement);
    let next: number;
    if (e.key === 'ArrowDown') next = (at + 1) % all.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    // Right opens and Left closes on either side (APG); a list on the left also takes the key that points at it.
    else if (
      inSub &&
      (e.key === 'Escape' || e.key === 'ArrowLeft' || (subOnLeft && e.key === 'ArrowRight'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      closeSub(true);
      return;
    } else if (
      e.target === parent &&
      (e.key === 'ArrowRight' || (subOnLeft && e.key === 'ArrowLeft'))
    ) {
      e.preventDefault();
      void openSub(true);
      return;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      return;
    } else if (e.key === 'Tab') {
      onClose(false);
      return;
    } else return;
    e.preventDefault();
    if (!inSub && subOpen) closeSub(false);
    all[next]?.focus();
  }

  onMount(() => {
    if (focusFirst) items(menu)[0]?.focus();
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
  <!-- A page script can reach these through the open shadow root; only the user may run a task or flip the site switch. -->
  {#if tasks.length > 0}
    <div class="bubble-sub-wrap">
      <button
        bind:this={parent}
        type="button"
        role="menuitem"
        tabindex="-1"
        class="bubble-sub-parent"
        aria-haspopup="menu"
        aria-expanded={subOpen}
        onpointerenter={(e) => {
          if (isUserGesture(e)) void openSub(false);
        }}
        onmousedown={(e) => e.preventDefault()}
        onclick={(e) => {
          if (isUserGesture(e)) void openSub(e.detail === 0);
        }}
        >Run task<svg viewBox="0 0 24 24" aria-hidden="true"
          ><path d={subOnLeft ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} /></svg
        ></button
      >
      {#if subOpen}
        <div
          bind:this={sub}
          class="bubble-menu bubble-submenu"
          class:on-left={subOnLeft}
          role="menu"
          aria-label="Run task"
          tabindex="-1"
          style:top="calc({subShift.y}px - var(--space-1) - 1px)"
          style:translate="{subShift.x}px 0"
        >
          {#each tasks as t (t.id)}
            <button
              type="button"
              role="menuitem"
              tabindex="-1"
              onmousedown={(e) => e.preventDefault()}
              onclick={(e) => {
                if (isUserGesture(e)) onRunTask(t.id);
              }}>{t.label}</button
            >
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <button
    type="button"
    role="menuitem"
    tabindex="-1"
    onpointerenter={() => closeSub(false)}
    onmousedown={(e) => e.preventDefault()}
    onclick={(e) => {
      if (isUserGesture(e)) onTurnOff();
    }}>Turn off on this site</button
  >
  <button
    type="button"
    role="menuitem"
    tabindex="-1"
    onpointerenter={() => closeSub(false)}
    onmousedown={(e) => e.preventDefault()}
    onclick={(e) => {
      if (isUserGesture(e)) onSettings();
    }}>Bubble settings</button
  >
</div>
