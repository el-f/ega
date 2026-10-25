/** Page-DOM version of the shared Button's `labels` (R63) for the page chip, whose shadow root has no tokens.css: every label sits in one grid cell, so a label swap keeps the widest one's width. */
export const STABLE_LABEL_CSS =
  '.ega-stable{display:inline-grid;justify-items:center}.ega-stable>*{grid-area:1/1}.ega-stable>[data-label]{visibility:hidden}.ega-stable>[data-label]::before{content:attr(data-label)}';

/** `current` shows; each of `labels` only holds its width. Its text comes from CSS, so it stays out of textContent and the accessible name. */
export function stableLabel(current: string, labels: readonly string[]): HTMLSpanElement {
  const stack = document.createElement('span');
  stack.className = 'ega-stable';
  const shown = document.createElement('span');
  shown.textContent = current;
  stack.append(shown);
  for (const label of labels) {
    const sizer = document.createElement('span');
    sizer.setAttribute('aria-hidden', 'true');
    sizer.dataset['label'] = label;
    stack.append(sizer);
  }
  return stack;
}
