import { sha256Hex } from '@/shared/sha256';
import type { GlossaryEntry } from '@/shared/glossary';

/** Order-independent SHA-256 of the entries; '' when no entry matches, so the cache key is unchanged for requests the glossary does not touch. */
export async function glossaryDigest(entries: readonly GlossaryEntry[]): Promise<string> {
  if (entries.length === 0) return '';
  const parts = entries
    .map((e) =>
      [
        e.term,
        e.translation,
        e.sourceLang ?? '',
        e.targetLang ?? '',
        e.caseSensitive ? '1' : '0',
      ].join('|'),
    )
    .sort();
  return sha256Hex(parts.join('\x1e'));
}
