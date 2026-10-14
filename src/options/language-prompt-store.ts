import type { PromptTemplate, Settings } from '@/shared/types';
import type { LanguagePrompt } from '@/shared/settings-schema';
import { replacePerPresetTemplates, replaceSettings } from '@/shared/storage';
import { withoutInheritedHalves } from '@/shared/storage/sanitise';

/** Stores the halves of `tpl` that differ from the Translate prompt; with none left, the language uses it again. */
export function saveLanguagePrompt(id: string, tpl: PromptTemplate): Promise<Settings> {
  return replaceSettings((cur) => {
    const { [id]: _old, ...rest } = cur.advanced.perPresetTemplates;
    void _old;
    const own = withoutInheritedHalves(tpl, cur.advanced.promptTemplate);
    const perPresetTemplates = Object.keys(own).length > 0 ? { ...rest, [id]: own } : rest;
    return { ...cur, advanced: { ...cur.advanced, perPresetTemplates } };
  });
}

/** Removes a language's own prompt. `removed` is read under the lock, so Undo puts back what was stored. */
export async function clearLanguagePrompt(
  id: string,
): Promise<{ settings: Settings; removed: LanguagePrompt | undefined }> {
  let removed: LanguagePrompt | undefined;
  const settings = await replacePerPresetTemplates((cur) => {
    const { [id]: old, ...rest } = cur;
    removed = old;
    return rest;
  });
  return { settings, removed };
}

export function restoreLanguagePrompt(id: string, prior: LanguagePrompt): Promise<Settings> {
  return replacePerPresetTemplates((cur) => ({ ...cur, [id]: prior }));
}
