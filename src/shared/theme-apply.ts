import type { Settings } from './types';

/** No storage import, so a content script can theme the shadow host before the settings chunk loads. */

export type ThemePref = Settings['theme'];

/** `system` removes `data-theme` and lets the media query decide; an explicit theme sets it. */
export function applyTheme(pref: ThemePref, target: HTMLElement = document.documentElement): void {
  if (pref === 'system') {
    delete target.dataset['theme'];
  } else {
    target.dataset['theme'] = pref;
  }
}

/** Page-forced data-theme wins, then the stored pref, then the media query; null = pref not read yet. */
export function mirrorTheme(target: HTMLElement, pref: ThemePref | null): void {
  const docTheme = document.documentElement.dataset['theme'];
  if (docTheme === 'light' || docTheme === 'dark') {
    target.dataset['theme'] = docTheme;
    return;
  }
  if (pref !== null) applyTheme(pref, target);
  else target.removeAttribute('data-theme');
}
