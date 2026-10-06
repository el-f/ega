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
  /** The name close() takes. Toasts with one key collapse into one with the newest text, except Undo ones. Default: the message. */
  key?: string;
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
// Every toast on screen. A closed one is dropped at once, so one still fading out is never revived in place.
const live = new Map<ToastId, { key: string; collapses: boolean }>();
let seq = 0;
let held = false;
// sonner removes a closed toast 200 ms after it starts to leave.
const LEAVE_GAP_MS = 250;

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
  live.delete(id);
}

function collapsedInto(key: string): ToastId | undefined {
  for (const [id, t] of live) if (t.collapses && t.key === key) return id;
  return undefined;
}

/** sonner 1.1.1 breaks its height list ("reading 'toastId'") when 3+ toasts leave together, so one leaves at a time. */
function closeOneByOne(ids: ToastId[]): void {
  for (const id of ids) forget(id);
  ids.forEach((id, i) => setTimeout(() => sonnerToast.dismiss(id), i * LEAVE_GAP_MS));
}

export const toastStore = {
  push(msg: ToastMsg): void {
    const kind = kindOf(msg.variant);
    // An Undo carries its own snapshot, so two of them stay two toasts.
    const collapses = msg.action === undefined || !actionExpires(msg.action);
    const key = msg.key ?? msg.message;
    const id = (collapses ? collapsedInto(key) : undefined) ?? `ega-toast-${seq++}`;
    const opts: SonnerOpts = {
      id,
      duration: Infinity,
      // Read out at once, not after the current sentence.
      important: kind === 'warning' || kind === 'error',
      onDismiss: (t) => forget(t.id),
    };
    if (msg.action) {
      const { label, onClick } = msg.action;
      // Sonner closes the toast after its action without calling onDismiss, so a repeat pushed meanwhile is a new toast.
      opts.action = {
        label,
        onClick: () => {
          forget(id);
          onClick();
        },
      };
    }
    variantToFn(msg.variant)(msg.message, opts);
    live.set(id, { key, collapses });
    // A repeat gets its own lifetime; the timer of the push it collapsed into must not end it.
    stopTimer(id);
    const ms = msg.countdownMs ?? toastLifetimeMs(kind, msg.action);
    if (ms === null) return;
    const entry: Timed = { ms, pauses: msg.countdownMs === undefined, timer: null };
    timed.set(id, entry);
    arm(id, entry);
  },
  /** Closes the toasts pushed under this key (the message, when the push named none). */
  close(key: string): void {
    closeOneByOne([...live].filter(([, t]) => t.key === key).map(([id]) => id));
  },
  /** A new action started: close every toast that waits for the user. */
  closeSticky(): void {
    closeOneByOne([...live.keys()].filter((id) => !timed.has(id)));
  },
  dismiss(): void {
    for (const id of [...live.keys()]) forget(id);
    sonnerToast.dismiss();
  },
  /** The pointer or focus is on a toast: timed toasts wait, then get a full timer again when it leaves. */
  hold(on: boolean): void {
    if (held === on) return;
    held = on;
    for (const [id, entry] of timed) if (entry.pauses) arm(id, entry);
  },
};
