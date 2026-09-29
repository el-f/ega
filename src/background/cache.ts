import { sha256Hex } from '@/shared/sha256';
import type { DetectedVariety } from '@/shared/types';

/** Every field that changes model output must be here, or two different requests share one cache slot. */
interface CacheKeyArgs {
  text: string;
  langId: string;
  targetLang: string;
  /** Digest of the redacted page context, not a presence flag: one phrase in two paragraphs sends two contexts. Absent = no context block. */
  contextDigest?: string;
  /** Operation run on the text. translate vs summarize vs reword of the
   *  same text produce different output — distinct slots. Absent ⇒ ''. */
  task?: string;
  /** Reword tone modifier. formal vs casual of the same text differ. */
  tone?: string;
  /** Explain asks for a cultural brief on top of the translation, and the tooltip sends it
   *  with no task, so without this axis an explain result is replayed on a plain translate. */
  explain?: boolean;
  /** Without it a refine hits the original request's slot and the refinement is lost. */
  refinement?: string;
  /** Hash of the matched glossary entries, sorted: they change the system prompt, so
   *  the same text with different entries is a different slot. Empty when none matched. */
  glossaryDigest?: string;
  /** Digest of the rendered rules block (rules depend on task and host); hashing the block keeps rule-free requests on one slot. */
  rulesDigest?: string;
  /** Hash of the history turns sent along: a different prefix is a different prompt.
   *  Empty for single-turn requests, which keeps their keys unchanged. */
  historyDigest?: string;
}

export async function cacheKey(a: CacheKeyArgs): Promise<string> {
  // JSON quoting is injective; a plain '|' join lets user text carrying '|' collide two requests onto one slot.
  return sha256Hex(
    JSON.stringify([
      a.text,
      a.langId,
      a.targetLang,
      a.contextDigest ?? '',
      a.task ?? '',
      a.tone ?? '',
      a.refinement ?? '',
      a.glossaryDigest ?? '',
      a.historyDigest ?? '',
      a.rulesDigest ?? '',
      a.explain ? 'e1' : '',
    ]),
  );
}

export interface CacheEntry {
  translation: string;
  confidence?: number;
  detectedLang?: string;
  detectedDetail?: string;
  detectedLangs?: DetectedVariety[];
  explain?: string;
  ts: number;
}

// Room for a large page translate: a smaller LRU evicts a block before its repeat arrives, and the repeat re-bills.
export const MAX_ENTRIES = 500;
const TTL_MS = 5 * 60 * 1000;

/** In-memory LRU + TTL cache; it dies with the service worker, by design. */
export class TranslationCache {
  private map = new Map<string, CacheEntry>();
  private gen = 0;

  /** Bumped by every `clear()`. A writer that captured an older value built its
   *  answer under settings this cache has since dropped. */
  generation(): number {
    return this.gen;
  }

  get(key: string): Promise<CacheEntry | undefined> {
    const e = this.map.get(key);
    if (!e) return Promise.resolve(undefined);
    if (Date.now() - e.ts > TTL_MS) {
      this.map.delete(key);
      return Promise.resolve(undefined);
    }
    this.map.delete(key);
    this.map.set(key, e);
    return Promise.resolve(e);
  }

  set(key: string, v: Omit<CacheEntry, 'ts'>, generation?: number): Promise<void> {
    if (generation !== undefined && generation !== this.gen) return Promise.resolve();
    this.map.set(key, { ...v, ts: Date.now() });
    while (this.map.size > MAX_ENTRIES) {
      const firstKey = this.map.keys().next().value;
      if (firstKey === undefined) break;
      this.map.delete(firstKey);
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.gen += 1;
    this.map.clear();
    return Promise.resolve();
  }
}
