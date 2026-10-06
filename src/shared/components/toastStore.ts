import { toast as sonnerToast } from 'svelte-sonner';
import { actionExpires, toastLifetimeMs, type ToastKind } from '@/shared/toast-policy';

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** The handler writes state captured when the toast opened, so the toast expires. Default: true for "Undo". */
  expires?: boolean;
}

export interface ToastMsg {
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  action?: ToastAction;
  /** A countdown ("Wait 7s…"): the toast lives exactly this long, pointer or not. */
  countdownMs?: number;
}

type ToastId = string | number;

interface SonnerOpts {
  id?: ToastId;
  duration: number;
  important: boolean;
  action?: { label: string; onClick: (e: MouseEvent) => void };
  onDismiss: (t: { id: ToastId }) => void;
}

function variantToFn(variant: ToastMsg['variant']): (msg: string, opts?: SonnerOpts) => ToastId {
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

// Sonner pauses on hover but not on focus, so the store owns the timers. A null timer = held.
interface Timed {
  ms: number;
  pauses: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
const timed = new Map<ToastId, Timed>();
// Identical toasts collapse; a dismissed toast drops its key, so one still fading out is never revived in place.
const byMessage = new Map<string, ToastId>();
let seq = 0;
let held = false;

function arm(id: ToastId, entry: Timed): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer =
    entry.pauses && held
      ? null
      : setTimeout(() => {
          forget(id);
          sonnerToast.dismiss(id);
        }, entry.ms);
}

function stopTimer(id: ToastId): void {
  const t = timed.get(id);
  if (t?.timer) clearTimeout(t.timer);
  timed.delete(id);
}

function forget(id: ToastId): void {
  stopTimer(id);
  for (const [message, owner] of byMessage) if (owner === id) byMessage.delete(message);
}

export const toastStore = {
  push(msg: ToastMsg): void {
    const kind = kindOf(msg.variant);
    // An Undo carries its own snapshot, so two of them stay two toasts.
    const collapses = msg.action === undefined || !actionExpires(msg.action);
    const id = (collapses ? byMessage.get(msg.message) : undefined) ?? `ega-toast-${seq++}`;
    const opts: SonnerOpts = {
      id,
      duration: Infinity,
      // Read out at once, not after the current sentence.
      important: kind === 'warning' || kind === 'error',
      onDismiss: (t) => forget(t.id),
    };
    if (msg.action) {
      const { label, onClick } = msg.action;
      // Drops sonner's MouseEvent argument — action handlers take none.
      opts.action = { label, onClick: () => onClick() };
    }
    variantToFn(msg.variant)(msg.message, opts);
    if (collapses) byMessage.set(msg.message, id);
    const ms = msg.countdownMs ?? toastLifetimeMs(kind, msg.action);
    if (ms === null) {
      stopTimer(id);
      return;
    }
    const entry: Timed = { ms, pauses: msg.countdownMs === undefined, timer: null };
    timed.set(id, entry);
    arm(id, entry);
  },
  dismiss(): void {
    for (const id of [...timed.keys()]) forget(id);
    byMessage.clear();
    sonnerToast.dismiss();
  },
  /** The pointer or focus is on a toast: timed toasts wait, then get a full timer again when it leaves. */
  hold(on: boolean): void {
    if (held === on) return;
    held = on;
    for (const [id, entry] of timed) if (entry.pauses) arm(id, entry);
  },
};
