/** One toast contract for every surface: the in-page toast and the extension pages' sonner toasts. */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

/** A plain confirmation hides itself after this long; the timer pauses while the pointer or focus is on it. */
export const PLAIN_TOAST_MS = 6000;

/** Only a plain confirmation hides itself. An instruction, a refusal, an error or anything with a button stays until dismissed. */
export function toastHidesItself(kind: ToastKind, hasAction: boolean): boolean {
  return kind === 'success' && !hasAction;
}
