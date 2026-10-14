import { MAX_SELECTION_CHARS } from '@/shared/constants';

/** One wording for the selection cap, so the popup and the side panel say the same thing.
 *  Kept out of constants.ts: that module is in the eager content-script bundle and never says this. */
export function selectionTrimmedMessage(source: 'selection' | 'clipboard' | 'message'): string {
  const what =
    source === 'clipboard'
      ? 'The copied text'
      : source === 'message'
        ? 'Your message'
        : 'The selected text';
  return `${what} is long — only the first ${MAX_SELECTION_CHARS} characters were sent.`;
}
