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

/** Short all-Latin terms ('AI', 'US') need whole-word edges; longer or non-Latin terms (CJK has no word edges) substring-match, so 'wallet' hits 'wallets'. */
const WORD_EDGE_MAX = 3;
const ALL_LATIN_LETTERS = /^[A-Z]+$/i;

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
  if (caseSensitive) return haystack.includes(term);
  return haystack.toLowerCase().includes(term.toLowerCase());
}

/** Only the filtered entries, never the whole glossary; '' when empty. */
export function renderGlossaryBlock(entries: readonly GlossaryEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map((e) => `  - ${quoteInline(e.term)} → ${quoteInline(e.translation)}`);
  return (
    'GLOSSARY (use these specific translations for these terms — override your default rendering):\n' +
    lines.join('\n') +
    '\n'
  );
}
