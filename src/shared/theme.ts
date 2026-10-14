import { getSettings, onSettingsChanged } from './storage';
import { applyTheme, mirrorTheme, type ThemePref } from './theme-apply';

export { applyTheme, type ThemePref };

/** Applies and follows the stored theme; a shadow host also mirrors the page's data-theme. Returns an unsubscribe. */
export function initTheme(target: HTMLElement = document.documentElement): () => void {
  // documentElement case: settings drives the attribute directly, no mirror.
  if (target === document.documentElement) {
    void getSettings()
      .then((s) => applyTheme(s.theme, target))
      .catch(() => {
        /* first-run / no-settings path — leave it at system default */
      });
    return onSettingsChanged((s) => applyTheme(s.theme, target));
  }

  let settingsTheme: ThemePref | null = null;
  const mirror = (): void => mirrorTheme(target, settingsTheme);
  void getSettings()
    .then((s) => {
      settingsTheme = s.theme;
      mirror();
    })
    .catch(() => {
      /* first-run / no-settings path */
    });
  const off = onSettingsChanged((s) => {
    settingsTheme = s.theme;
    mirror();
  });
  mirror();
  const observer = new MutationObserver(mirror);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => {
    off();
    observer.disconnect();
  };
}
