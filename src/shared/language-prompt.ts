/** The prompt Translate and Explain run for a source language. Its own module, so the popup's task chunk stays small. */
import { builtInTask } from './task-prompts';
import { findTask, hasOwnPrompt, TONE_SLOT } from './task-view';
import { resolveSnippets } from './snippets';
import type { CustomTask } from './settings-schema';
import type { PromptTemplate, Settings } from './types';

/** Each half is the language's own, else the Translate prompt's. */
export function languagePrompt(s: Settings, langId: string): PromptTemplate {
  const global = s.advanced.promptTemplate;
  const own = Object.hasOwn(s.advanced.perPresetTemplates, langId)
    ? s.advanced.perPresetTemplates[langId]
    : undefined;
  return { system: own?.system ?? global.system, user: own?.user ?? global.user };
}

/** The prompt a request runs has {{tone}}: Translate and Explain run the source language's prompt, the rest their own. */
export function taskUsesTone(
  s: Settings,
  customs: readonly CustomTask[],
  id: string,
  sourceLang: string,
): boolean {
  const t = builtInTask(id);
  if (t === null || hasOwnPrompt(t)) return findTask(s, customs, id)?.usesTone ?? false;
  const p = languagePrompt(s, sourceLang);
  return TONE_SLOT.test(resolveSnippets(p.system + p.user, s.advanced.snippets));
}
