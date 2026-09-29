import { toast as sonnerToast } from 'svelte-sonner';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMsg {
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;
  action?: ToastAction;
}

interface SonnerOpts {
  duration: number;
  action?: { label: string; onClick: (e: MouseEvent) => void };
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

/** A warning or an error has to be read and acted on; a confirmation does not. */
function defaultDuration(variant: ToastMsg['variant']): number {
  return variant === 'danger' || variant === 'warning' ? 8000 : 3000;
}

export const toastStore = {
  push(msg: ToastMsg): void {
    const fn = variantToFn(msg.variant);
    const duration = msg.duration === 0 ? Infinity : (msg.duration ?? defaultDuration(msg.variant));
    const opts: SonnerOpts = { duration };
    if (msg.action) {
      const { label, onClick } = msg.action;
      // Drops sonner's MouseEvent argument — action handlers take none.
      opts.action = { label, onClick: () => onClick() };
    }
    fn(msg.message, opts);
  },
  dismiss(): void {
    sonnerToast.dismiss();
  },
};
