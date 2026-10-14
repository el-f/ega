import { describe, expect, it } from 'vitest';
import { MAX_SELECTION_CHARS } from '@/shared/constants';
import { selectionTrimmedMessage } from '@/shared/selection-cap-copy';

describe('selectionTrimmedMessage', () => {
  it.each([
    ['selection', 'The selected text'],
    ['clipboard', 'The copied text'],
    ['message', 'Your message'],
  ] as const)('uses the source-specific subject for %s input', (source, subject) => {
    expect(selectionTrimmedMessage(source)).toBe(
      `${subject} is long — only the first ${MAX_SELECTION_CHARS} characters were sent.`,
    );
  });
});
