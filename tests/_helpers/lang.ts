// Brand casts for fixtures, so tests do not repeat asLangIdUnsafe at every call site.
import {
  asLangIdUnsafe,
  asLangPresetIdUnsafe,
  type LangPresetId,
  type LangSelection,
} from '@/shared/brands';

export const preset = (s: string): LangPresetId => asLangPresetIdUnsafe(s);
export const sel = (s: string): LangSelection => (s === 'auto' ? 'auto' : asLangIdUnsafe(s));
