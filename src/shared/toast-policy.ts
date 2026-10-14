/** One toast contract for every surface: the in-page toast and the extension pages' sonner toasts. */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

/** A plain confirmation hides itself after this long. */
const PLAIN_TOAST_MS = 6000;

/** A toast whose button writes a snapshot (Undo) hides itself after this long, so a late click cannot overwrite newer edits. */
const UNDO_TOAST_MS = 8000;

/** Only an Undo writes state captured when the toast opened; any other button stays valid until it is used. */
export function actionExpires(action: { label: string }): boolean {
  return action.label === 'Undo';
}

/**
 * How long a toast stays on screen (cross-spec X14). The timer waits while the pointer or focus is on the toast.
 * null = until dismissed: an instruction, a refusal, an error, or a button that stays valid (Try again, Open settings, Replace).
 */
export function toastLifetimeMs(kind: ToastKind, action?: { label: string }): number | null {
  if (action !== undefined) return actionExpires(action) ? UNDO_TOAST_MS : null;
  return kind === 'success' ? PLAIN_TOAST_MS : null;
}
