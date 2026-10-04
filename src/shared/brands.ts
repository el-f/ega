import * as v from 'valibot';

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type BackendId = Brand<string, 'BackendId'>;

/** A BCP-47-shaped code: 2-3 lowercase letters, then optional dashed subtags. */
export const LANG_ID_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9-]+)?$/;

export const LangIdSchema = v.pipe(
  v.string(),
  v.minLength(2),
  v.maxLength(64),
  v.regex(LANG_ID_PATTERN),
  v.brand('LangId'),
);
export type LangId = v.InferOutput<typeof LangIdSchema>;

// EGA-internal preset id — NOT a BCP-47 lang code; LangId for those.
export const LangPresetIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(64),
  v.regex(/^[a-z0-9][\w-]*$/i),
  v.brand('LangPresetId'),
);
export type LangPresetId = v.InferOutput<typeof LangPresetIdSchema>;

/** 'auto' means the LLM detects the language. */
export type LangSelection = LangId | LangPresetId | 'auto';

// Post-validation casts; grep the Unsafe suffix to find them all.
export const asBackendIdUnsafe = (s: string): BackendId => s as unknown as BackendId;
export const asLangIdUnsafe = (s: string): LangId => s as unknown as LangId;
export const asLangPresetIdUnsafe = (s: string): LangPresetId => s as unknown as LangPresetId;

/** Picks the branch by shape: 'auto', then BCP-47 code, else preset id. */
export function asLangSelection(s: string): LangSelection {
  if (s === 'auto') return 'auto';
  if (/^[a-z]{2,3}(?:-[A-Za-z0-9-]+)?$/.test(s)) return asLangIdUnsafe(s);
  return asLangPresetIdUnsafe(s);
}
