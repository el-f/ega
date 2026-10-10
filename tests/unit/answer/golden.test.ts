import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createMemoizedJsonParser,
  parseJsonResponse,
  streamingTranslation,
} from '@/shared/backends/base';
import { createThinkScrubber } from '@/shared/backends/think-scrubber';
import { buildTaskPrompt } from '@/shared/prompts';
import { CARD_CONTRACT, PLAIN_CONTRACT } from '@/shared/answer/formats-v1';
import { asLangIdUnsafe } from '@/shared/brands';
import { carriesAnswer } from '@/shared/answer/legacy-reader';
import { readAnswer } from '@/shared/answer/reader';
import { answerSpecFor } from '@/shared/answer/spec';

interface ReaderGolden {
  name: string;
  raw: string;
  expected: unknown;
  prefixes: string[];
}
interface PromptGolden {
  name: string;
  output: 'plain' | 'card';
  system: string;
  expected: { system: string; user: string };
}
const reader = JSON.parse(
  readFileSync(new URL('../../fixtures/answer-golden-v1.json', import.meta.url), 'utf8'),
) as ReaderGolden[];
const prompts = JSON.parse(
  readFileSync(new URL('../../fixtures/custom-prompt-golden-v1.json', import.meta.url), 'utf8'),
) as PromptGolden[];

function finish(raw: string): unknown {
  const scrubber = createThinkScrubber();
  const visible = scrubber.push(raw) + scrubber.flush();
  const parsed = parseJsonResponse(visible);
  if (!visible.trim() || !carriesAnswer(visible, parsed)) return { error: 'SERVER' };
  const { translation: _translation, ...done } = parsed;
  return { text: streamingTranslation(visible, parsed), done };
}

describe('answer reader compatibility recorded before DTO changes', () => {
  it.each(reader)('$name: terminal answer and fields', ({ raw, expected }) => {
    expect(finish(raw)).toEqual(expected);
  });
  it.each(reader)('$name: every streamed prefix', ({ raw, prefixes }) => {
    const parser = createMemoizedJsonParser();
    const scrubber = createThinkScrubber();
    let visible = '';
    const actual = [...raw].map((character) => {
      visible += scrubber.push(character);
      return streamingTranslation(visible, parser(visible));
    });
    expect(actual).toEqual(prefixes);
  });
});

describe('spec reader compared with the frozen v1 results', () => {
  const improved: Record<string, unknown> = {
    'a key in the wrong case': { text: 'hello', done: {} },
    'F1 main alias': { text: 'hello', done: {} },
    'F3 notes list': { text: 'hello', done: { explain: 'First note\nSecond note' } },
    'F4 percent score': { text: 'hello', done: { confidence: 0.85 } },
    'F13 nested envelope': { text: 'hello', done: {} },
  };
  it.each(reader)('$name: unchanged unless named F1, F3, F4 or F13', ({ name, raw, expected }) => {
    const scrubber = createThinkScrubber();
    const result = readAnswer(answerSpecFor('translate'), scrubber.push(raw) + scrubber.flush());
    // Error categories change in their own slice; this comparison checks usable answers.
    if (result.kind === 'error') expect(expected).toEqual({ error: 'SERVER' });
    else {
      const { translation: _translation, ...done } = result.fields;
      expect({ text: result.main, done }).toEqual(improved[name] ?? expected);
    }
  });
});

describe('custom prompt bytes recorded before DTO changes', () => {
  it.each(prompts)('$name', ({ output, system, expected }) => {
    expect(
      buildTaskPrompt({
        req: {
          id: 'golden',
          text: 'A small sample',
          sourceLang: 'auto',
          targetLang: asLangIdUnsafe('en'),
          options: { stream: false, explain: false, task: 'custom-golden' },
        },
        build: { preset: undefined, template: { system, user: '{{text}}' } },
        glossaryBlock: '',
        rulesBlock: '',
        contract: output === 'plain' ? PLAIN_CONTRACT : CARD_CONTRACT,
      }),
    ).toEqual(expected);
  });
});
