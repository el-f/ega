import { describe, it, expect } from 'vitest';
import {
  ALL_TASKS,
  ALL_TONES,
  TASK_DESCRIPTIONS,
  TASK_GERUND,
  TASK_LABELS,
  TONE_LABELS,
  buildTaskTemplate,
  answerFormatFor,
  FORMAT_MARKER,
} from '@/shared/task-prompts';

// Mostly structural contracts; the output-language block pins a few guard phrases on purpose, so rewording those lines breaks it.

const CALLABLE_TASKS = ALL_TASKS.filter(
  // translate uses its own pipeline; explain is normalized by the
  // router to translate+explain. Neither reaches buildTaskTemplate.
  (t) => t !== 'translate' && t !== 'explain',
);

// A forced "confidence": 1 showed every summary, rewrite and answer as "100% sure".
describe('buildTaskTemplate — no made-up confidence', () => {
  it.each(CALLABLE_TASKS)('%s does not ask for a confidence', (task) => {
    expect(buildTaskTemplate(task, 'neutral').system).not.toMatch(/"confidence"/);
  });
});

describe('buildTaskTemplate — contract', () => {
  describe('routing boundaries', () => {
    it('throws for translate — callers use the translate template', () => {
      expect(() => buildTaskTemplate('translate')).toThrow();
    });

    it('throws for explain — router normalizes to translate+explain', () => {
      expect(() => buildTaskTemplate('explain')).toThrow();
    });
  });

  describe('every callable task', () => {
    it.each(CALLABLE_TASKS)('%s returns a non-empty system+user template', (task) => {
      const tpl = buildTaskTemplate(task);
      expect(tpl.system.length).toBeGreaterThan(0);
      expect(tpl.user.length).toBeGreaterThan(0);
    });

    it.each(CALLABLE_TASKS)(
      '%s user template preserves the {{text}} placeholder in a triple-quote fence',
      (task) => {
        const tpl = buildTaskTemplate(task);
        expect(tpl.user).toMatch(/"""\s*\{\{text\}\}\s*"""/);
      },
    );

    it.each(CALLABLE_TASKS)(
      '%s has a JSON answer format with at least a "translation" field, kept out of the editable text',
      (task) => {
        expect(answerFormatFor(task).text).toMatch(/^Return JSON ONLY: .*"translation"/);
        expect(buildTaskTemplate(task).system).not.toContain(FORMAT_MARKER);
      },
    );
  });

  describe('reword tones', () => {
    it('reword template uses the {{tone}} slot — resolution deferred to buildPrompt', () => {
      const t = buildTaskTemplate('reword', 'formal');
      expect(t.system).toContain('{{tone}}');
    });

    it('tone arg does not change the template — tone is a runtime slot', () => {
      // Tone phrase is substituted by buildPrompt via ctx.tone + TONE_PHRASE.
      // The build-time output is identical across tones; this is by design.
      const seen = new Set(ALL_TONES.map((tone) => buildTaskTemplate('reword', tone).system));
      expect(seen.size).toBe(1);
    });
  });

  describe('suggest-replies', () => {
    const tpl = buildTaskTemplate('suggest-replies');

    it('template uses {{targetLangLabel}} so buildPrompt can substitute the user target', () => {
      // A literal "the target language" made the model guess, often replying in the source language.
      expect(tpl.system).toContain('{{targetLangLabel}}');
    });

    it('JSON contract carries translation, and no explain field', () => {
      const format = answerFormatFor('suggest-replies').text;
      expect(format).toMatch(/"translation"/);
      // Nothing parsed the tone list, so the literal "casual | neutral | polite" reached the user as the explanation.
      expect(format + tpl.system).not.toMatch(/"explain"/);
    });
  });

  describe('UI-facing maps', () => {
    it.each(ALL_TASKS)('%s has a label, description, and gerund', (task) => {
      expect(TASK_LABELS[task]).toBeTruthy();
      expect(TASK_DESCRIPTIONS[task]).toBeTruthy();
      expect(TASK_GERUND[task]).toBeTruthy();
    });

    it.each(ALL_TONES)('%s has a label', (tone) => {
      expect(TONE_LABELS[tone]).toBeTruthy();
    });
  });

  describe('output language', () => {
    it.each(['summarize', 'ask', 'grammar', 'reword'] as const)(
      '%s template carries {{targetLangLabel}} so buildPrompt substitutes the target',
      (task) => {
        expect(buildTaskTemplate(task).system).toContain('{{targetLangLabel}}');
      },
    );

    // summarize and ask answer in the target language, so they must not carry the "never translate" guard.
    it.each(['summarize', 'ask'] as const)(
      '%s does NOT keep the source language — its whole output goes to the target',
      (task) => {
        const s = buildTaskTemplate(task).system;
        expect(s).not.toMatch(/same language/i);
        expect(s).not.toMatch(/never translate|do not translate/i);
      },
    );

    it('grammar: corrected TEXT stays source, corrections list goes to the target', () => {
      const s = buildTaskTemplate('grammar').system;
      expect(s).toMatch(/corrected text in the SAME language/i);
      expect(s).toMatch(/never translate/i);
      expect(s).toMatch(/corrections list in \{\{targetLangLabel\}\}/);
      // swap-guard: the corrected text must NOT be pushed into the target
      expect(s).not.toMatch(/corrected text[^.]*\{\{targetLangLabel\}\}/i);
    });

    it('reword: reworded TEXT stays source, the note goes to the target', () => {
      const s = buildTaskTemplate('reword').system;
      expect(s).toMatch(/keeping the SAME language/i);
      expect(s).toMatch(/restyle only, never translate/i);
      expect(s).toMatch(/"explain" note in \{\{targetLangLabel\}\}/);
      // swap-guard: the rewrite must NOT be pushed into the target
      expect(s).not.toMatch(/Rewrite the text[^.]*\{\{targetLangLabel\}\}/i);
    });

    it('help text advertises the target language for the target-output tasks', () => {
      expect(TASK_DESCRIPTIONS.explain).toMatch(/target language/i);
      expect(TASK_DESCRIPTIONS.summarize).toMatch(/target language/i);
      expect(TASK_DESCRIPTIONS.ask).toMatch(/target language/i);
    });
  });
});

// The untrusted-data preamble told the model to ignore requests inside the fence that holds the user's own question.
describe('ask', () => {
  it("marks the QUESTION as the user's own request", () => {
    expect(buildTaskTemplate('ask').system).toContain(
      "The QUESTION is the user's request: answer it.",
    );
  });
});
