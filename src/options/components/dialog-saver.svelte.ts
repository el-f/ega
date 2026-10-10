import { SvelteMap } from 'svelte/reactivity';
import { saveFailureReason } from '@/options/storage-with-toast';
import { confirmDialog } from '@/shared/components/confirmDialog';

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
 * The dialogs' one save model (spec 5.1): each field saves on its own as it changes (text 600 ms after the last
 * key, or when focus leaves it), the footer says "Saving..." only for a slow write, then "Saved", or why not. A field
 * that was not saved stays named until it is fixed or saved; nothing waits for a Save button.
 */
export function createDialogSaver() {
  let status = $state<SaveStatus>({ kind: 'idle' });
  // One waiting write per field, so typing in one field never drops another field's edit.
  const pending = new SvelteMap<string, () => Promise<unknown>>();
  // Fields whose last change is not saved, with their footer line, newest last.
  const held = new SvelteMap<string, string>();
  // Bumped on every change of a field, so a write that started before the change cannot report on it.
  let edits: Record<string, number> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function touch(field: string): void {
    edits[field] = (edits[field] ?? 0) + 1;
  }
  function hold(field: string, message: string): void {
    held.delete(field);
    held.set(field, message);
  }

  async function run(write: () => Promise<unknown>, field?: string): Promise<boolean> {
    const mine = ++generation;
    const edit = field === undefined ? undefined : edits[field];
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
      if (field !== undefined && edits[field] === edit) hold(field, message);
      if (mine === generation) status = { kind: 'error', message };
      return false;
    } finally {
      clearTimeout(slow);
    }
  }

  async function flush(): Promise<boolean> {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const writes = [...pending.entries()];
    pending.clear();
    let ok = true;
    for (const [field, write] of writes) ok = (await run(write, field)) && ok;
    return ok;
  }

  function discard(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending.clear();
    held.clear();
    edits = {};
  }

  // Closing the page saves what is waiting; a field held back would be lost with it, so the browser asks first.
  const onPageHide = (): void => void flush();
  const onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (pending.size > 0) void flush();
    if (held.size > 0) e.preventDefault();
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    get status(): SaveStatus {
      // A later save of another field never hides the one that was not saved.
      const last = [...held.values()].at(-1);
      const settled = status.kind === 'idle' || status.kind === 'saving' || status.kind === 'saved';
      return last !== undefined && settled ? { kind: 'error', message: last } : status;
    },
    /** A toggle, a radio or a select: saved at once, after any typed edit still waiting. */
    async now(write: () => Promise<unknown>): Promise<boolean> {
      await flush();
      return run(write);
    },
    /** Typed text: saved once the typing pauses, or on flush. A newer edit of the same field replaces the waiting one. */
    later(field: string, write: () => Promise<unknown>): void {
      touch(field);
      held.delete(field);
      pending.set(field, write);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void flush(), TEXT_SAVE_DELAY_MS);
    },
    /** Saves every waiting edit at once (blur, close, Export). */
    flush,
    /** A field that is not valid is not saved; the footer names it until it is fixed or saved. */
    invalid(field: string, message: string): void {
      touch(field);
      pending.delete(field);
      hold(field, `Not saved: ${message}`);
      generation += 1;
      status = { kind: 'idle' };
    },
    /** A replacement is valid; retire the old field's held error and waiting edit before saving it. */
    valid(field: string): void {
      touch(field);
      held.delete(field);
      pending.delete(field);
      generation += 1;
      status = { kind: 'idle' };
    },
    note(message: string, undo?: () => void): void {
      generation += 1;
      status = undo ? { kind: 'note', message, undo } : { kind: 'note', message };
    },
    /** Drops what is waiting and what was held back: a reset, a reload or a delete replaces every field. */
    discard,
    /** The dialog is gone: what is waiting still saves. */
    dispose(): void {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flush();
    },
  };
}

/** Closing with a field that is not valid asks first and names it (spec 5.1). True when the dialog may close. */
export function confirmCloseWithout(fields: readonly string[]): Promise<boolean> {
  if (fields.length === 0) return Promise.resolve(true);
  const many = fields.length > 1;
  const names = many ? `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}` : fields[0];
  return confirmDialog({
    title: many ? 'Close without these changes?' : 'Close without this change?',
    body: many
      ? `Your last changes to ${names} are not valid, so they were not saved.`
      : `Your last change to ${names} is not valid, so it was not saved.`,
    confirmLabel: 'Close anyway',
    cancelLabel: 'Keep editing',
  });
}
