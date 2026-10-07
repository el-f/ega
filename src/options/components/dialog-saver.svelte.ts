import { SvelteMap } from 'svelte/reactivity';
import { saveFailureReason } from '@/options/storage-with-toast';

/** What the dialog footer says about saving. */
export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }
  /** A plain line, with Undo when the last action can be taken back ("Back to built-in"). */
  | { kind: 'note'; message: string; undo?: () => void };

const SLOW_MS = 300;
export const TEXT_SAVE_DELAY_MS = 600;

/** A write the dialog refused for a reason it can name; the footer says "Not saved: <message>". */
export class NotSavedError extends Error {}

/**
 * The dialogs' one save model: every field saves as it changes (text 600 ms after the last key), the footer
 * says "Saving..." only for a slow write, then "Saved", or why not; nothing waits for a Save button.
 */
export function createDialogSaver() {
  let status = $state<SaveStatus>({ kind: 'idle' });
  // One waiting write per field, so typing in one field never drops another field's edit.
  const pending = new SvelteMap<string, () => Promise<unknown>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  async function run(write: () => Promise<unknown>): Promise<boolean> {
    const mine = ++generation;
    const slow = setTimeout(() => {
      if (mine === generation) status = { kind: 'saving' };
    }, SLOW_MS);
    try {
      await write();
      if (mine === generation) status = { kind: 'saved' };
      return true;
    } catch (e) {
      const message =
        e instanceof NotSavedError ? `Not saved: ${e.message}` : saveFailureReason(e).message;
      if (mine === generation) status = { kind: 'error', message };
      return false;
    } finally {
      clearTimeout(slow);
    }
  }

  async function flush(): Promise<boolean> {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const writes = [...pending.values()];
    pending.clear();
    let ok = true;
    for (const write of writes) ok = (await run(write)) && ok;
    return ok;
  }

  return {
    get status(): SaveStatus {
      return status;
    },
    /** True while a typed edit waits for the pause. */
    get waiting(): boolean {
      return pending.size > 0;
    },
    /** A toggle, a radio or a select: saved at once, after any typed edit still waiting. */
    async now(write: () => Promise<unknown>): Promise<boolean> {
      await flush();
      return run(write);
    },
    /** Typed text: saved once the typing pauses, or on flush. A newer edit of the same field replaces the waiting one. */
    later(field: string, write: () => Promise<unknown>): void {
      pending.set(field, write);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void flush(), TEXT_SAVE_DELAY_MS);
    },
    /** Saves every waiting edit at once (blur, close). */
    flush,
    /** A field that is not valid is not saved; the footer names it. Its waiting save is dropped. */
    invalid(field: string, message: string): void {
      pending.delete(field);
      generation += 1;
      status = { kind: 'error', message: `Not saved: ${message}` };
    },
    note(message: string, undo?: () => void): void {
      generation += 1;
      status = undo ? { kind: 'note', message, undo } : { kind: 'note', message };
    },
    dispose(): void {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}

export type DialogSaver = ReturnType<typeof createDialogSaver>;
