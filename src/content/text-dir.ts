/** Scripts written right to left: Arabic, Hebrew, Thaana, Syriac, N'Ko, Adlam, Hanifi Rohingya, Mandaic, Samaritan. */
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg', 'Mand', 'Samr']);

/**
 * `rtl` for a language tag whose likely script reads right to left, so a translation that starts with a Latin
 * brand name still lays out right to left. `auto` for any other, unknown or missing tag: it follows the text.
 */
export function textDir(tag: string | null | undefined): 'rtl' | 'auto' {
  if (!tag) return 'auto';
  try {
    const script = new Intl.Locale(tag).maximize().script;
    return script !== undefined && RTL_SCRIPTS.has(script) ? 'rtl' : 'auto';
  } catch {
    return 'auto';
  }
}
