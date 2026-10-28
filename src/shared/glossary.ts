import type { GlossaryEntryFromSchema } from './settings-schema';
import { quoteInline } from './prompts';

export type GlossaryEntry = GlossaryEntryFromSchema;

interface MatchCtx {
  /** Source text the user is translating. Term match runs against this. */
  text: string;
  /** Active source-lang code or 'auto'. Entry scoping uses string equality. */
  sourceLang: string;
  /** Active target-lang code or 'auto'. */
  targetLang: string;
}

/** Entries whose lang scope matches and whose term appears in `text`.
 *  Order preserved from input array. */
export function filterGlossaryForRequest(
  glossary: readonly GlossaryEntry[],
  ctx: MatchCtx,
): readonly GlossaryEntry[] {
  if (glossary.length === 0) return [];
  const text = ctx.text.normalize('NFC');
  const out: GlossaryEntry[] = [];
  for (const e of glossary) {
    if (e.sourceLang !== undefined && e.sourceLang !== ctx.sourceLang) continue;
    if (e.targetLang !== undefined && e.targetLang !== ctx.targetLang) continue;
    if (!termAppears(text, e.term.normalize('NFC'), e.caseSensitive)) continue;
    out.push(e);
  }
  return out;
}

/** Short all-Latin terms ('AI', 'US') need whole-word edges. Other Latin, Cyrillic and Greek terms must start a word, but may end inside one, so 'wallet' hits 'wallets' and 'Rust' misses 'trust'. Only a letter of those scripts blocks the start, so 'Rust' still hits 'このRust'. Every other script substring-matches: CJK and Thai have no word edges, and Hebrew and Arabic join prefix letters to the word. */
const WORD_EDGE_MAX = 3;
const ALL_LATIN_LETTERS = /^[A-Z]+$/i;
const STARTS_WORD_SCRIPT = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u;
// Inherited covers the shared combining accents; a Thai or Devanagari mark has its own script.
const WORD_CHAR =
  /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Inherited}\p{N}_]/u;

function termAppears(haystack: string, term: string, caseSensitive: boolean): boolean {
  if (term === '') return false;
  // Only letters reach the RegExp, so the term needs no escaping.
  if (term.length <= WORD_EDGE_MAX && ALL_LATIN_LETTERS.test(term)) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}_])${term}(?![\\p{L}\\p{N}_])`,
      caseSensitive ? 'u' : 'iu',
    );
    return re.test(haystack);
  }
  const hay = caseSensitive ? haystack : haystack.toLowerCase();
  const needle = caseSensitive ? term : term.toLowerCase();
  if (!STARTS_WORD_SCRIPT.test(term)) return hay.includes(needle);
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    // The last code point before the hit; the two-unit slice keeps a surrogate pair whole.
    const before = [...hay.slice(Math.max(0, i - 2), i)].pop() ?? '';
    if (!WORD_CHAR.test(before)) return true;
  }
  return false;
}

/** Only the filtered entries, never the whole glossary; '' when empty. */
export function renderGlossaryBlock(
  entries: readonly GlossaryEntry[],
  options: { sameLanguage?: boolean } = {},
): string {
  if (entries.length === 0) return '';
  const lines = entries.map((e) => `  - ${quoteInline(e.term)} → ${quoteInline(e.translation)}`);
  // "Translations" pushed Reword and Grammar to translate the text.
  const heading = options.sameLanguage
    ? 'GLOSSARY (use this wording for these terms; keep the text in its own language):\n'
    : 'GLOSSARY (use these specific translations for these terms — override your default rendering):\n';
  return heading + lines.join('\n') + '\n';
}
