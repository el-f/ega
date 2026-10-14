/**
 * Svelte action for a toolbar: one tab stop, and Left/Right/Home/End move focus among its buttons.
 * The last focused button keeps the stop; when it goes away, the first button takes it.
 */
export function roving(node: HTMLElement): { destroy: () => void } {
  let current: HTMLElement | null = null;
  const items = (): HTMLElement[] =>
    [...node.querySelectorAll<HTMLElement>('button')].filter((b) => !b.closest('[hidden]'));
  const sync = (): void => {
    const list = items();
    if (!current || !list.includes(current)) current = list[0] ?? null;
    for (const b of list) b.tabIndex = b === current ? 0 : -1;
  };
  const onFocusIn = (e: FocusEvent): void => {
    if (!(e.target instanceof HTMLElement) || !items().includes(e.target)) return;
    current = e.target;
    sync();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    const list = items();
    const at = list.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const to: Record<string, number> = {
      ArrowRight: (at + 1) % list.length,
      ArrowLeft: (at - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    };
    const next = list[to[e.key] ?? -1];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  // Buttons come and go as the state changes; the stop must always sit on one that is there.
  const observer = new MutationObserver(sync);
  observer.observe(node, { childList: true, subtree: true });
  node.addEventListener('focusin', onFocusIn);
  node.addEventListener('keydown', onKeyDown);
  sync();
  return {
    destroy() {
      observer.disconnect();
      node.removeEventListener('focusin', onFocusIn);
      node.removeEventListener('keydown', onKeyDown);
    },
  };
}
