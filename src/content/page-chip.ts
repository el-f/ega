import { errorCopy } from '@/shared/error-copy';
import type { ErrCode } from '@/shared/types';
import type { SettingsTab } from '@/shared/settings-tabs';
import { isUserGesture } from './user-gesture';
import { sendMsg } from '@/shared/messages';
import { debugCatch } from '@/shared/logger';

// Its own shadow root keeps the host page's font and button styles off it; one fixed red (6.2:1 under white) reads on any page background.
const CHIP_CSS = `:host{all:initial;display:inline-flex;vertical-align:middle;margin-inline-start:.4em}
.chip{display:inline-flex;align-items:center;gap:6px;padding:2px 2px 2px 8px;border-radius:999px;background:#b3242a;color:#fff;font:600 12px/16px system-ui,sans-serif;white-space:nowrap} /* token-lint-allow page DOM, no tokens */
.chip.bare{padding-inline-end:8px}
button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;min-height:24px;padding:0 8px;border:1px solid rgb(255 255 255 / .6);border-radius:999px;color:#fff;font:inherit;cursor:pointer}
button:hover{background:rgb(255 255 255 / .15)}
button:focus-visible{outline:2px solid #fff;outline-offset:2px}
svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@media (forced-colors:active){.chip{border:1px solid CanvasText}}`;

let chipSeq = 0;

async function openSettings(tab: SettingsTab): Promise<void> {
  try {
    await sendMsg({ kind: 'ui:open-options', tab });
  } catch (e) {
    debugCatch(e, 'content.pageChip.openSettings');
  }
}

function chipButton(
  label: string,
  icon: string,
  describedBy: string,
  run: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-describedby', describedBy);
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${label}`;
  // The button lives in the page's own DOM, so a page script can click it; only a real click acts.
  btn.onclick = (e) => {
    if (isUserGesture(e)) run();
  };
  return btn;
}

const RETRY_ICON =
  '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>';
const SETTINGS_ICON = '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>';

/**
 * A page-DOM chip that names a failure from the error catalog, with the catalog's first next step:
 * Open settings when a setting fixes it, otherwise Try again when the caller can retry.
 */
export function mountErrorChip(
  err: { code: ErrCode | 'EMPTY'; message: string },
  opts: { backend?: string; onRetry?: () => void } = {},
): HTMLElement {
  const host = document.createElement('span');
  host.setAttribute('data-ega-tx-error', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CHIP_CSS;
  const copy = errorCopy(err.code, err.message, opts.backend ? { backend: opts.backend } : {});
  const chip = document.createElement('span');
  chip.className = 'chip';
  const title = document.createElement('span');
  title.id = `ega-chip-${++chipSeq}`;
  title.textContent = copy?.title ?? 'Something went wrong';
  chip.append(title);
  const actions = copy?.actions ?? [];
  const retry = opts.onRetry && actions.includes('try-again') ? opts.onRetry : undefined;
  if (copy && actions[0] === 'open-settings') {
    const { tab } = copy;
    const btn = chipButton('Open settings', SETTINGS_ICON, title.id, () => void openSettings(tab));
    btn.setAttribute('data-ega-chip-settings', '');
    chip.append(btn);
  } else if (retry) {
    const btn = chipButton('Try again', RETRY_ICON, title.id, retry);
    btn.setAttribute('data-ega-retry-block', '');
    chip.append(btn);
  } else {
    chip.classList.add('bare');
  }
  root.append(style, chip);
  return host;
}
