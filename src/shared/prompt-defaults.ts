import { DEFAULT_PROMPT_TEMPLATE, PREVIOUS_PROMPT_TEMPLATE } from './settings-schema';
import { TRANSLATE_FORMAT } from './answer/formats-v1';

/** v9 rows saved before format text left the editable template. */
export const V9_FULL_PROMPT_TEMPLATE = {
  system: DEFAULT_PROMPT_TEMPLATE.system + TRANSLATE_FORMAT.sep + TRANSLATE_FORMAT.text,
  user: DEFAULT_PROMPT_TEMPLATE.user,
};

export function isPromptTemplateCustomised(t: { system: string; user: string }): boolean {
  return ![DEFAULT_PROMPT_TEMPLATE, V9_FULL_PROMPT_TEMPLATE, PREVIOUS_PROMPT_TEMPLATE].some(
    (d) => t.system === d.system && t.user === d.user,
  );
}
