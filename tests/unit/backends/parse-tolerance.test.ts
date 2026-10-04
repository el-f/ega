import { describe, it, expect } from 'vitest';
import {
  createMemoizedJsonParser,
  emitTerminal,
  parseJsonResponse,
  streamingTranslation,
} from '@/shared/backends/base';
import { createThinkScrubber } from '@/shared/backends/think-scrubber';
import type { ErrCode, TranslationChunk } from '@/shared/types';

const FENCE = '```';

type Want = { text: string; done: Record<string, unknown> } | { error: ErrCode };

/** What the user sees at done: the router scrubs think blocks from the deltas, and the terminal comes from the backend. */
function finish(raw: string): Want {
  let terminal: TranslationChunk | undefined;
  emitTerminal((c) => (terminal = c), 'r1', 'Model', raw);
  if (terminal?.type === 'error') return { error: terminal.code };
  if (terminal?.type !== 'done') throw new Error('expected a terminal chunk');
  const { type: _type, requestId: _id, ...done } = terminal;
  const scrub = createThinkScrubber();
  const visible = scrub.push(raw) + scrub.flush();
  return { text: streamingTranslation(visible, parseJsonResponse(visible)), done };
}

const table: Array<[name: string, raw: string, want: Want]> = [
  [
    'clean envelope',
    '{"translation":"hello","confidence":0.9,"detectedLang":"arabizi"}',
    { text: 'hello', done: { confidence: 0.9, detectedLang: 'arabizi' } },
  ],
  [
    'fenced envelope',
    `${FENCE}json\n{"translation":"hello","confidence":0.9,"detectedLang":"arabizi"}\n${FENCE}`,
    { text: 'hello', done: { confidence: 0.9, detectedLang: 'arabizi' } },
  ],
  [
    'prose preamble',
    'Here is the translation:\n{"translation":"hello","confidence":0.9}',
    { text: 'hello', done: { confidence: 0.9 } },
  ],
  [
    'trailing prose with a brace',
    '{"translation":"hello","confidence":0.9,"detectedLang":"arabizi"}\n\nNote: I kept {name} as-is.',
    { text: 'hello', done: { confidence: 0.9, detectedLang: 'arabizi' } },
  ],
  [
    'trailing comma',
    '{"translation":"hello","confidence":0.9,"detectedLang":"arabizi",}',
    { text: 'hello', done: { confidence: 0.9, detectedLang: 'arabizi' } },
  ],
  [
    'trailing comma, pretty-printed and fenced',
    `${FENCE}json\n{\n  "translation": "hello",\n  "confidence": 0.9,\n  "explain": "x",\n}\n${FENCE}`,
    { text: 'hello', done: { confidence: 0.9, explain: 'x' } },
  ],
  [
    'trailing comma inside a nested array',
    '{"translation":"hi","detectedLangs":[{"id":"arabizi"},],}',
    { text: 'hi', done: { detectedLangs: [{ id: 'arabizi' }] } },
  ],
  [
    'double closing brace',
    '{"translation":"hello","confidence":0.9}}',
    { text: 'hello', done: { confidence: 0.9 } },
  ],
  [
    'raw newline in the translation',
    '{"translation":"line one\nline two","confidence":0.9,"detectedLang":"arabizi"}',
    { text: 'line one\nline two', done: { confidence: 0.9, detectedLang: 'arabizi' } },
  ],
  [
    'raw newline and tab in explain',
    '{"translation":"I have a cat.","confidence":1,"explain":"was I has → now I have\n\twas cat → now cat."}',
    {
      text: 'I have a cat.',
      done: { confidence: 1, explain: 'was I has → now I have\n\twas cat → now cat.' },
    },
  ],
  [
    'unescaped quote inside a Hebrew acronym',
    '{"translation":"צה"ל הודיע היום","confidence":0.9,"detectedLang":"en"}',
    { text: 'צה"ל הודיע היום', done: { confidence: 0.9, detectedLang: 'en' } },
  ],
  [
    'unescaped quote before a comma',
    '{"translation":"He said "hi", then left","confidence":0.9}',
    { text: 'He said "hi", then left', done: { confidence: 0.9 } },
  ],
  [
    'translation null with explain',
    '{"translation":null,"confidence":0.8,"explain":"It is a greeting."}',
    { text: '', done: { confidence: 0.8, explain: 'It is a greeting.' } },
  ],
  [
    'explain with no translation key',
    '{"explain":"It is a greeting."}',
    { text: '', done: { explain: 'It is a greeting.' } },
  ],
  ['translation null and no explain', '{"translation":null}', { error: 'SERVER' }],
  [
    'detectedLangs given as bare ids',
    '{"translation":"hello","confidence":0.9,"detectedLangs":["arabizi","gen-z"]}',
    {
      text: 'hello',
      done: { confidence: 0.9, detectedLangs: [{ id: 'arabizi' }, { id: 'gen-z' }] },
    },
  ],
  [
    'think block that restates the format with braces',
    '<think>\nI must return {"translation": string}. Draft: {"translation":"draft","confidence":0.3}\n</think>\n{"translation":"final","confidence":0.8,"detectedLang":"arabizi","explain":"x"}',
    { text: 'final', done: { confidence: 0.8, detectedLang: 'arabizi', explain: 'x' } },
  ],
  [
    'think draft, then the answer',
    '<think>{"translation":"draft","confidence":0.3}</think>\n{"translation":"final","confidence":0.9}',
    { text: 'final', done: { confidence: 0.9 } },
  ],
  [
    'think block and nothing else',
    '<think>{"translation":"draft","confidence":0.3}</think>',
    { error: 'SERVER' },
  ],
  [
    'fenced empty envelope (an image with no text)',
    `${FENCE}json\n{"translation": "", "confidence": 0}\n${FENCE}`,
    { text: '', done: { confidence: 0 } },
  ],
  [
    'empty envelope with a trailing comma',
    '{"translation":"","confidence":0,}',
    { text: '', done: { confidence: 0 } },
  ],
  [
    'fenced plain text',
    `${FENCE}\nhello\n${FENCE}`,
    { text: `${FENCE}\nhello\n${FENCE}`, done: {} },
  ],
  ['plain text led by inline code', '`x` means y', { text: '`x` means y', done: {} }],
  ['plain text with braces', 'use {name} here', { text: 'use {name} here', done: {} }],
  ['plain text with an unmatched brace', 'use {name here', { text: 'use {name here', done: {} }],
  ['a key in the wrong case', '{"Translation":"hello"}', { error: 'SERVER' }],
];

describe('what a slightly malformed model reply shows at done', () => {
  for (const [name, raw, want] of table) {
    it(name, () => {
      expect(finish(raw)).toEqual(want);
    });
  }
});

describe('a think block is never the answer', () => {
  it('a think-only reply is the empty-answer error', () => {
    const chunks: TranslationChunk[] = [];
    emitTerminal((c) => chunks.push(c), 'r1', 'Model', '<think>drafting</think>\n');
    expect(chunks).toEqual([
      {
        type: 'error',
        requestId: 'r1',
        code: 'SERVER',
        message: 'Model returned an empty answer.',
      },
    ]);
  });
});

describe('mid-stream, a fenced reply never paints its fence, key or braces', () => {
  const bodies = [
    `${FENCE}json\n{"translation":"hello","confidence":0.9}\n${FENCE}`,
    `${FENCE}json\n{"translation": "", "confidence": 0}\n${FENCE}`,
    `${FENCE}json\n{\n  "translation": "hello",\n  "confidence": 0.9,\n}\n${FENCE}`,
    `${FENCE}json\n{"translation":\n  "hello there my friend","confidence":0.9}\n${FENCE}`,
  ];
  for (const body of bodies) {
    it(JSON.stringify(body).slice(0, 40), () => {
      const parse = createMemoizedJsonParser();
      for (let i = 1; i <= body.length; i++) {
        const acc = body.slice(0, i);
        expect(streamingTranslation(acc, parse(acc)), JSON.stringify(acc)).not.toMatch(
          /```|translation|[{}]/,
        );
      }
    });
  }
});
