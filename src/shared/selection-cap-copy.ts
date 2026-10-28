import { MAX_SELECTION_CHARS } from '@/shared/constants';

/** One wording for the selection cap, so the popup, the side panel and the page's queue say the same thing. */
export function selectionTrimmedMessage(source: 'selection' | 'clipboard' | 'message'): string {
  const what =
    source === 'clipboard'
      ? 'The copied text'
      : source === 'message'
        ? 'Your message'
        : 'The selected text';
  return `${what} is long — only the first ${MAX_SELECTION_CHARS} characters were sent.`;
}
