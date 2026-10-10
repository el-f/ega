/** The import files' first check. Options-only, so the popup and the side panel never load them. */
import * as v from 'valibot';

/** What the options import parser checks up front. Loose objects, so a newer file's extra keys are ignored; rows, edits and prompts are checked one by one, as the tasks file is. */
export const varietiesBundleLenientSchema = v.object({
  egaVarieties: v.object({
    v: v.picklist([1, 2]),
    customLanguages: v.array(v.unknown()),
    varietyOverrides: v.optional(v.unknown()),
    disabledVarieties: v.optional(v.unknown()),
    presetTemplates: v.optional(v.unknown()),
    snippets: v.optional(v.unknown()),
  }),
});

/** The tasks file. Loose objects, so a newer file's extra keys are ignored; rows and edits are checked one by one. */
export const tasksBundleLenientSchema = v.object({
  egaTasks: v.object({
    v: v.number(),
    customTasks: v.array(v.unknown()),
    taskOverrides: v.optional(v.unknown()),
    disabledTasks: v.optional(v.unknown()),
    contextMenuItems: v.optional(v.unknown()),
    translatePrompt: v.optional(v.unknown()),
    snippets: v.optional(v.unknown()),
  }),
});

/** The one-language file. Loose objects, so a newer file's extra keys are ignored; the row and its prompt are checked on their own. */
export const languageBundleLenientSchema = v.object({
  egaLanguage: v.object({
    v: v.number(),
    language: v.unknown(),
    prompt: v.optional(v.unknown()),
    snippets: v.optional(v.unknown()),
  }),
});

/** The glossary file. Loose objects, so a newer file's extra keys are ignored; entries are checked one by one. */
export const glossaryBundleLenientSchema = v.object({
  egaGlossary: v.object({ v: v.number(), entries: v.array(v.unknown()) }),
});
