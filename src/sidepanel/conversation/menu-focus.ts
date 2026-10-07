/** What a press focuses: the control under it, or the nearest focusable box around it (an article, a scroll box). */
const PRESS_FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex], [contenteditable="true"]';

/**
 * Props for a panel menu's DropdownMenu.Content. bits traps focus in an open menu, so an outside press has its focus
 * pulled back in, then handed to the trigger or dropped on <body> as the menu closes. This puts it where the press
 * would have: on the pressed control, or nowhere for blank space. Esc and a keyboard choice still return to the trigger.
 */
export function outsidePressFocus(): {
  onInteractOutside: (e: PointerEvent) => void;
  onCloseAutoFocus: (e: Event) => void;
} {
  let pressed: Element | null = null;
  return {
    onInteractOutside: (e) => {
      pressed = e.target instanceof Element ? e.target : null;
    },
    onCloseAutoFocus: (e) => {
      const target = pressed;
      pressed = null;
      if (target === null) return;
      e.preventDefault();
      target.closest<HTMLElement>(PRESS_FOCUSABLE)?.focus({ preventScroll: true });
    },
  };
}
