import { getPreset } from '@/shared/presets';
import type { CustomLanguage } from '@/shared/types';

/** Name for a language id on a page surface. A custom variety's id is a UUID, so the raw
 *  id is never showable; ISO codes stay as they are, because the table is a lazy chunk. */
export function varietyLabel(id: string, customs: readonly CustomLanguage[]): string {
  return getPreset(id)?.label ?? customs.find((c) => c.id === id)?.label ?? id;
}
