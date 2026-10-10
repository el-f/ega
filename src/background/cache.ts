import { sha256Hex } from '@/shared/sha256';
import type { AnswerSnapshot, DetectedVariety, ResultMeta } from '@/shared/types';
import type { AnswerNote, AnswerDetail } from '@/shared/answer/reader';
import type { ChatTurn } from '@/shared/chat-history';
import type { AnswerSpec } from '@/shared/answer/spec';

/** What the model reads for a text request: the rendered prompt and the history sent beside it.
 *  Every output-changing modifier reaches one of these, so none can be left out of the key. */
export interface RequestFingerprint {
  system: string;
  user: string;
  /** Effort and prompt capabilities vary by task, so two tasks never share a slot. */
  task: string;
  history?: readonly ChatTurn[];
  answerSpec?: AnswerSpec;
}

export async function cacheKey(f: RequestFingerprint): Promise<string> {
  // JSON quoting is injective; a plain '|' join lets user text carrying '|' collide two requests onto one slot.
  return sha256Hex(
    JSON.stringify([
      f.system,
      f.user,
      f.task,
      (f.history ?? []).map((h) => [h.role, h.content]),
      ...(f.answerSpec ? [f.answerSpec] : []),
    ]),
  );
}

export interface CacheEntry {
  translation: string;
  answer?: AnswerSnapshot;
  notes?: AnswerNote[];
  details?: AnswerDetail[];
  answerFormat?: ResultMeta['answerFormat'];
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
