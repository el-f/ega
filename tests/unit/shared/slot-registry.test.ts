import { describe, it, expect } from 'vitest';
import {
  SLOT_REGISTRY,
  slotsFor,
  slotsForTask,
  validateAgainstSlots,
  extractCustomSlots,
  isBuiltInSlot,
  requiredMissingSlots,
} from '@/shared/slot-registry';
import { ALL_TASKS } from '@/shared/task-prompts';

describe('slot-registry', () => {
  it('slotsFor a custom task id offers only the slots every task fills', () => {
    const names = slotsFor('custom-1700000000000').map((s) => s.name);
    expect(names).toContain('text');
    expect(names).toContain('tone');
    expect(names).not.toContain('explainInstr');
    expect(names).not.toContain('detectiveInstr');
    expect(names).toEqual(
      Object.values(SLOT_REGISTRY)
        .filter((s) => ALL_TASKS.every((t) => s.filledFor.includes(t)))
        .map((s) => s.name),
    );
  });

  it('slotsFor a built-in task matches slotsForTask', () => {
    expect(slotsFor('explain')).toEqual(slotsForTask('explain'));
  });

  it('exposes built-in slots with description + filledFor', () => {
    const text = SLOT_REGISTRY['text'];
    expect(text).toBeDefined();
    expect(text?.required).toBe(true);
    expect(text?.filledFor).toEqual([...ALL_TASKS]);
  });

  it('slotsForTask("translate") includes text + langLabel + targetLangLabel + context', () => {
    const slots = slotsForTask('translate').map((s) => s.name);
    expect(slots).toEqual(
      expect.arrayContaining([
        'text',
        'langLabel',
        'targetLangLabel',
        'langHint',
        'examples',
        'context',
      ]),
    );
  });

  it('slotsForTask("summarize") includes text + targetLangLabel', () => {
    const slots = slotsForTask('summarize').map((s) => s.name);
    expect(slots).toEqual(
      expect.arrayContaining(['text', 'targetLangLabel', 'langLabel', 'context']),
    );
  });

  it('slotsForTask("ask") includes text + targetLangLabel', () => {
    const slots = slotsForTask('ask').map((s) => s.name);
    expect(slots).toEqual(expect.arrayContaining(['text', 'targetLangLabel']));
  });

  it('slotsForTask("reword") includes text + tone', () => {
    const slots = slotsForTask('reword').map((s) => s.name);
    expect(slots).toEqual(expect.arrayContaining(['text', 'tone']));
  });

  it('slotsForTask("suggest-replies") includes targetLangLabel', () => {
    const slots = slotsForTask('suggest-replies').map((s) => s.name);
    expect(slots).toEqual(expect.arrayContaining(['text', 'targetLangLabel']));
  });

  it('validateAgainstSlots rejects template missing required {{text}}', () => {
    const res = validateAgainstSlots({ system: 'sys', user: 'just user' }, 'translate');
    expect(res.ok).toBe(false);
    // The message explains the slot and names the recovery path.
    expect(res.errors[0]?.message).toMatch(/must contain \{\{text\}\}/);
    expect(res.errors[0]?.message).toMatch(/selected text/);
    expect(res.errors[0]?.message).toMatch(/Insert variable/);
  });

  it('validateAgainstSlots accepts template with all required slots', () => {
    const res = validateAgainstSlots({ system: 'sys', user: 'TEXT: {{text}}' }, 'translate');
    expect(res.ok).toBe(true);
  });

  it('validateAgainstSlots warns on unknown slot', () => {
    const res = validateAgainstSlots(
      { system: 'sys', user: '{{text}} {{noSuchSlot}}' },
      'translate',
    );
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.message === 'Unknown variable {{noSuchSlot}}')).toBe(true);
  });

  it('validateAgainstSlots warns with the task label when a slot is not available for the task', () => {
    const res = validateAgainstSlots({ system: '{{explainInstr}}', user: '{{text}}' }, 'translate');
    expect(res.ok).toBe(true);
    expect(
      res.warnings.some(
        (w) => w.message === '{{explainInstr}} is not available for the Translate task',
      ),
    ).toBe(true);
  });

  it('validateAgainstSlots accepts {{tone}} on every task', () => {
    for (const task of ALL_TASKS) {
      const res = validateAgainstSlots({ system: '{{tone}}', user: '{{text}}' }, task);
      expect(res.warnings).toEqual([]);
    }
  });

  it('extractCustomSlots returns slots not in registry', () => {
    const custom = extractCustomSlots({
      system: '{{text}} {{persona}}',
      user: '{{text}} {{custom1}}',
    });
    expect(custom).toEqual(expect.arrayContaining(['persona', 'custom1']));
    expect(custom).not.toContain('text');
  });

  it('requiredMissingSlots lists required slots absent from the user template', () => {
    expect(requiredMissingSlots('translate', 'just user')).toEqual(['text']);
    expect(requiredMissingSlots('translate', 'TEXT: {{text}}')).toEqual([]);
    // A bare mention without braces is not a fill.
    expect(requiredMissingSlots('translate', 'the text goes here')).toEqual(['text']);
  });

  it('requiredMissingSlots agrees with the validateAgainstSlots save gate', () => {
    for (const user of ['no slots', '{{text}}', '{{targetLangLabel}} only']) {
      const gate = validateAgainstSlots({ system: '', user }, 'translate');
      expect(requiredMissingSlots('translate', user)).toEqual(gate.errors.map((e) => e.slot));
    }
  });

  it('isBuiltInSlot returns true for registered slots', () => {
    expect(isBuiltInSlot('text')).toBe(true);
    expect(isBuiltInSlot('langLabel')).toBe(true);
    expect(isBuiltInSlot('persona')).toBe(false);
  });
});
