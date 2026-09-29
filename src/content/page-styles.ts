import css from './page-styles.css?inline';

const STYLE_ID = 'ega-page-styles';

// Reuse only the element this module created — any page can ship a decoy carrying our id.
let styleEl: HTMLStyleElement | null = null;

/** Injects the page-document sheet for the wrappers page-translate and inline-replace create. */
export function ensurePageStyles(): void {
  if (styleEl?.isConnected) return;
  styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

/** Test-only: drop the sheet so a fresh call re-injects it. */
export function resetPageStyles(): void {
  styleEl?.remove();
  styleEl = null;
}
