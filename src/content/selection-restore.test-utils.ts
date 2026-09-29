import {
  onSelectionChange,
  onUserInput,
  onVisibilityOrFocus,
  selectionRestoreInternal,
} from './selection-restore';

/** Resets module state and removes the document listeners so each test starts clean. */
export function resetSelectionRestore(): void {
  selectionRestoreInternal.cached = null;
  selectionRestoreInternal.graceUntil = 0;
  selectionRestoreInternal.installed = false;
  selectionRestoreInternal.lastUserInputAt = 0;
  document.removeEventListener('selectionchange', onSelectionChange);
  document.removeEventListener('visibilitychange', onVisibilityOrFocus);
  window.removeEventListener('focus', onVisibilityOrFocus);
  document.removeEventListener('mousedown', onUserInput, true);
  document.removeEventListener('keydown', onUserInput, true);
}
