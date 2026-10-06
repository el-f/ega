import { toast as sonnerToast } from 'svelte-sonner';
import { PLAIN_TOAST_MS, toastHidesItself, type ToastKind } from '@/shared/toast-policy';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMsg {
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  action?: ToastAction;
}

interface SonnerOpts {
  duration: number;
  action?: { label: string; onClick: (e: MouseEvent) => void };
  onDismiss: (t: { id: string | number }) => void;
}

function variantToFn(
  variant: ToastMsg['variant'],
): (msg: string, opts?: SonnerOpts) => string | number {
  switch (variant) {
    case 'success':
      return sonnerToast.success;
    case 'warning':
      return sonnerToast.warning;
    case 'danger':
      return sonnerToast.error;
    case 'info':
      return sonnerToast.info;
    case undefined:
      return sonnerToast.message;
  }
}

function kindOf(variant: ToastMsg['variant']): ToastKind {
  return variant === 'danger' ? 'error' : (variant ?? 'info');
}

// Sonner pauses on hover but not on focus, so the store owns the plain-toast timers. null = held.
const timers = new Map<string | number, ReturnType<typeof setTimeout> | null>();
let held = false;

function arm(id: string | number): void {
  const old = timers.get(id);
  if (old) clearTimeout(old);
  timers.set(
    id,
    held
      ? null
      : setTimeout(() => {
          timers.delete(id);
          sonnerToast.dismiss(id);
        }, PLAIN_TOAST_MS),
  );
}

function forget(id: string | number): void {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

export const toastStore = {
  push(msg: ToastMsg): void {
    const fn = variantToFn(msg.variant);
    const opts: SonnerOpts = { duration: Infinity, onDismiss: (t) => forget(t.id) };
    if (msg.action) {
      const { label, onClick } = msg.action;
      // Drops sonner's MouseEvent argument — action handlers take none.
      opts.action = { label, onClick: () => onClick() };
    }
    const id = fn(msg.message, opts);
    if (toastHidesItself(kindOf(msg.variant), msg.action !== undefined)) arm(id);
  },
  dismiss(): void {
    for (const id of [...timers.keys()]) forget(id);
    sonnerToast.dismiss();
  },
  /** The pointer or focus is on a toast: plain toasts wait, then get a full timer again when it leaves. */
  hold(on: boolean): void {
    if (held === on) return;
    held = on;
    for (const id of [...timers.keys()]) arm(id);
  },
};
