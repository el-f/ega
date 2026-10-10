import { isIsoCode } from '@/shared/languages';
import { taskCapabilities, type TaskView } from '@/shared/task-view';

// Only varieties with a real language and script; slang, jargon and Elvish name no tag.
const VARIETY_TAGS: ReadonlyMap<string, string> = new Map([['arabizi', 'ar-Latn']]);

/** Tag for a `lang` attribute; undefined for 'auto', a custom language or an unknown id. Page DOM leaves the attribute out; our English shells write '' (unknown). */
export function langTag(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  return isIsoCode(id) ? id : VARIETY_TAGS.get(id);
}

/** Uses the task's reply language; legacy custom tasks default to the target. */
export function replyLang(
  task: string,
  target: string | undefined,
  input: string | undefined,
  views?: readonly TaskView[],
): string | undefined {
  return taskCapabilities(task, views).answersIn === 'input' ? input : target;
}

/** Sets the tag, or drops the attribute so the text takes the language of what holds it. */
export function markLang(el: Element, tag: string | undefined): void {
  if (tag === undefined) el.removeAttribute('lang');
  else el.setAttribute('lang', tag);
}
