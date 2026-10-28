import { describe, expect, it } from 'vitest';
import { splitReplyFormat } from '@/options/components/prompt/prompt-checks';
import {
  buildCustomPreviewPrompt,
  buildPreviewPrompt,
  PREVIEW_SAMPLE_TEXT,
} from '@/options/preview-prompt';
import { answerFormatFor, buildTaskTemplate } from '@/shared/task-template';
import { customAnswerContract } from '@/shared/answer/custom';
import { DEFAULT_PROMPT_TEMPLATE, parseSettings } from '@/shared/settings-schema';
import { FORMAT_MARKER } from '@/shared/answer/formats-v1';

const s = parseSettings({});
const request = {
  text: PREVIEW_SAMPLE_TEXT,
  sourceLang: 'auto' as const,
  targetLang: s.defaultTargetLang,
  varieties: [],
};

describe('the Preview splits off the reply format the builder adds', () => {
  it('a task prompt ends with exactly its format', () => {
    const built = buildPreviewPrompt(s, {
      ...request,
      task: 'summarize',
      explain: false,
      template: buildTaskTemplate('summarize'),
    });
    const parts = splitReplyFormat(built.system);
    expect(parts.format).toBe(answerFormatFor('summarize').text);
    expect(parts.system).not.toContain(FORMAT_MARKER);
    expect(parts.system).toContain('Summarize the text');
  });

  it('the Translate prompt, run as Explain, keeps its whole format and its explain field', () => {
    const built = buildPreviewPrompt(s, {
      ...request,
      task: 'translate',
      explain: true,
      template: DEFAULT_PROMPT_TEMPLATE,
    });
    const parts = splitReplyFormat(built.system);
    const lines = answerFormatFor('translate').text.split('\n');
    expect(parts.format?.startsWith(FORMAT_MARKER)).toBe(true);
    expect(parts.format?.endsWith(lines.at(-1) ?? '')).toBe(true);
    expect(parts.format).toContain('"explain"');
    expect(parts.system).not.toContain(FORMAT_MARKER);
  });

  it("a custom task's contract is the format", () => {
    const row = {
      label: 'Polite',
      system: 'Be polite.',
      user: '{{text}}',
      output: 'card' as const,
      pageContext: false,
      image: false,
      glossary: false,
    };
    const built = buildCustomPreviewPrompt(s, { ...request, id: 'c1', row });
    const parts = splitReplyFormat(built.system);
    expect(parts.format).toBe(`${customAnswerContract(row, 'c1')}\nAnswer in English.`);
    expect(parts.system.endsWith('Be polite.')).toBe(true);
  });

  it('a system with no format has no format part', () => {
    expect(splitReplyFormat('Just words.')).toEqual({ system: 'Just words.', format: null });
  });
});
