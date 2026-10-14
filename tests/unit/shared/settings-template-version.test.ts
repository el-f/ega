import { isPromptTemplateCustomised } from '@/shared/prompt-defaults';
import { describe, it, expect } from 'vitest';
import {
  CURRENT_TEMPLATE_VERSION,
  DEFAULT_PROMPT_TEMPLATE,
  PREVIOUS_PROMPT_TEMPLATE,
  parseStoredSettings,
} from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { sanitiseStoredSettings } from '@/shared/storage/sanitise';
import { V8_PROMPT_TEMPLATE } from './_v8-prompt-template';
import { V7_PROMPT_TEMPLATE } from './_v7-prompt-template';

/** `updateSettings` writes the whole expanded object, so a real stored row carries the
 *  shipped template text of whatever version the profile last saved under. */
function storedRowWith(promptTemplate: { system: string; user: string }, templateVersion: number) {
  return {
    ...DEFAULT_SETTINGS,
    advanced: { ...DEFAULT_SETTINGS.advanced, promptTemplate, templateVersion },
  };
}

const parse = (raw: unknown) => parseStoredSettings(raw, { defaults: DEFAULT_SETTINGS });

describe('prompt-template customization, across a version bump', () => {
  it('the shipped default is not customized', () => {
    const out = parse(storedRowWith(DEFAULT_PROMPT_TEMPLATE, CURRENT_TEMPLATE_VERSION));
    expect(isPromptTemplateCustomised(out.advanced.promptTemplate)).toBe(false);
  });

  it('a row still holding the PREVIOUS shipped text is not customized', () => {
    const out = parse(storedRowWith(V8_PROMPT_TEMPLATE, CURRENT_TEMPLATE_VERSION - 1));
    expect(out.advanced.promptTemplate.system).toBe(V8_PROMPT_TEMPLATE.system);
    expect(isPromptTemplateCustomised(out.advanced.promptTemplate)).toBe(false);
  });

  it('the previous shipped text really is stale — the default moved', () => {
    expect(V8_PROMPT_TEMPLATE.system).not.toBe(DEFAULT_PROMPT_TEMPLATE.system);
  });

  // Only the current and previous shipped texts are recognized; two bumps back reads as
  // customized, so that profile is offered the diff instead of being silently overwritten.
  it('a row two versions back reads as customized', () => {
    const out = parse(storedRowWith(V7_PROMPT_TEMPLATE, CURRENT_TEMPLATE_VERSION - 2));
    expect(isPromptTemplateCustomised(out.advanced.promptTemplate)).toBe(true);
  });

  it('an edited row is customized', () => {
    const edited = { ...V7_PROMPT_TEMPLATE, system: `${V7_PROMPT_TEMPLATE.system}\nAlways rhyme.` };
    const out = parse(storedRowWith(edited, CURRENT_TEMPLATE_VERSION - 1));
    expect(isPromptTemplateCustomised(out.advanced.promptTemplate)).toBe(true);
  });

  it('an edited user template is customized even when the system half matches', () => {
    const edited = { system: DEFAULT_PROMPT_TEMPLATE.system, user: 'TEXT: {{text}}' };
    const out = parse(storedRowWith(edited, CURRENT_TEMPLATE_VERSION));
    expect(isPromptTemplateCustomised(out.advanced.promptTemplate)).toBe(true);
  });
});

// A settings save writes the whole object, so an untouched template sits on disk as a copy of an old default.
describe('a stored copy of a shipped default runs the current default', () => {
  const run = (t: { system: string; user: string }, version: number) =>
    sanitiseStoredSettings(storedRowWith(t, version) as unknown as Record<string, unknown>, [])
      .advanced.promptTemplate;

  it('the previous shipped text is upgraded, and so is its version', () => {
    expect(run(V8_PROMPT_TEMPLATE, CURRENT_TEMPLATE_VERSION - 1)).toEqual(DEFAULT_PROMPT_TEMPLATE);
    const row = storedRowWith(V8_PROMPT_TEMPLATE, CURRENT_TEMPLATE_VERSION - 1);
    const out = sanitiseStoredSettings(row as unknown as Record<string, unknown>, []);
    expect(out.advanced.templateVersion).toBe(CURRENT_TEMPLATE_VERSION);
  });

  it('an edited template is kept as written', () => {
    const edited = { ...V8_PROMPT_TEMPLATE, system: `${V8_PROMPT_TEMPLATE.system}\nAlways rhyme.` };
    expect(run(edited, CURRENT_TEMPLATE_VERSION - 1)).toEqual(edited);
  });

  it("a template two versions back reads as the user's own and is kept", () => {
    expect(run(V7_PROMPT_TEMPLATE, CURRENT_TEMPLATE_VERSION - 2)).toEqual(V7_PROMPT_TEMPLATE);
  });
});

// The pair has to move together: a bump that edits the default but forgets the previous text
// tells every profile that never opened the editor that its template is customized.
describe('the previous shipped text is the version before current', () => {
  it('matches the v8 fixture while current is 9', () => {
    expect(CURRENT_TEMPLATE_VERSION).toBe(9);
    expect(PREVIOUS_PROMPT_TEMPLATE).toEqual(V8_PROMPT_TEMPLATE);
  });
});
