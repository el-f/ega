/** v1 tolerant extraction, retained byte-for-byte while callers move to worker projection. */
import { debugCatch } from '../logger';
import type { DetectedVariety } from '../types';
import type { AnswerOf, TRANSLATE_SPEC } from './spec';
export type ParsedResult = Pick<AnswerOf<typeof TRANSLATE_SPEC>, 'translation'> &
  Partial<Omit<AnswerOf<typeof TRANSLATE_SPEC>, 'translation'>>;

// ReDoS-safe: avoids `\s*` adjacent to `[\s\S]*?` (would drive polynomial
// backtracking on malformed input). Caller trims the captured group.
const JSON_FENCE = /```(?:json)?([\s\S]*?)```/i;

/** 0..1 as asked, 10..100 read as a percent; anything else is dropped, since the pill would show it as the model's certainty. */
function toConfidence(n: unknown): number | undefined {
  const x = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
  if (x >= 0 && x <= 1) return x;
  if (x >= 10 && x <= 100) return x / 100;
  return undefined;
}

/** Drops details of 200+ chars (a hallucinated paragraph breaks the pill layout), same cap as detectedDetail. */
function parseDetectedLangs(raw: unknown): DetectedVariety[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: DetectedVariety[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.length > 0) {
      out.push({ id: entry });
      continue;
    }
    if (entry === null || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec['id'] === 'string' ? rec['id'] : undefined;
    if (id === undefined || id.length === 0) continue;
    const detailRaw = rec['detail'];
    const detail =
      typeof detailRaw === 'string' && detailRaw.length > 0 && detailRaw.length < 200
        ? detailRaw
        : undefined;
    out.push(detail !== undefined ? { id, detail } : { id });
  }
  return out.length > 0 ? out : undefined;
}

/** Models answer a multi-line request with an array of lines often enough that dropping
 *  it (and rendering a blank result) is worse than joining it. */
function coerceTranslation(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) return raw.join('\n');
  return undefined;
}

function isBlank(c: string | undefined): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r';
}

function dropTrailingComma(out: string): string {
  let j = out.length - 1;
  while (j >= 0 && isBlank(out[j])) j--;
  return out[j] === ',' ? out.slice(0, j) + out.slice(j + 1) : out;
}

/** The first balanced object in `c`, with raw \n \r \t in strings escaped, a stray inner quote escaped and trailing commas dropped; null when the braces never balance. */
function repairEnvelope(c: string): string | null {
  const start = c.indexOf('{');
  if (start === -1) return null;
  let out = '';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < c.length; i++) {
    const ch = c[i] ?? '';
    if (inStr) {
      if (ch === '\\') {
        out += ch + (c[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (isBlank(c[j])) j++;
        const next = c[j];
        // A comma closes the string only when a key or the object's end follows it: 'said "yalla", then' is text.
        let k = j + 1;
        while (isBlank(c[k])) k++;
        const commaCloses =
          next === ',' && (c[k] === undefined || c[k] === '"' || c[k] === '}' || c[k] === ']');
        // A real closing quote is always followed by one of these; any other quote is text.
        if (next === undefined || commaCloses || next === '}' || next === ']' || next === ':') {
          inStr = false;
        } else {
          out += '\\"';
          continue;
        }
      }
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ch;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' || ch === ']') {
      out = dropTrailingComma(out);
      if (ch === '}' && --depth === 0) return out + ch;
    }
    out += ch;
  }
  return null;
}

/** Strict first, so valid JSON is never rewritten; one repaired retry after that. */
export function parseLenient(c: string): unknown {
  try {
    return JSON.parse(c);
  } catch (strictErr) {
    const fixed = repairEnvelope(c);
    if (fixed === null) throw strictErr;
    return JSON.parse(fixed);
  }
}

function inOpenFence(body: string): boolean {
  const at = body.indexOf('```');
  return at !== -1 && body.slice(0, at).trim() === '' && !body.includes('```', at + 3);
}

/** A `{`-led body, or one inside an open ``` fence, is an envelope still arriving: show nothing yet. */
function envelopeArriving(body: string): boolean {
  const lead = firstNonBlank(body);
  return lead === '{' || (lead === '`' && inOpenFence(body));
}

/** Hot path: runs on every streaming delta. Manual `typeof` narrowing instead of a valibot parse, to avoid per-delta schema overhead. */
export function parseJsonResponse(body: string): ParsedResult {
  const candidates: string[] = [];
  // JSON_FENCE cannot match without a closing fence, so this guard stops it re-scanning the accumulator on every delta.
  const firstFence = body.indexOf('```');
  if (firstFence !== -1 && body.includes('```', firstFence + 3)) {
    const fenced = body.match(JSON_FENCE);
    if (fenced?.[1]) candidates.push(fenced[1].trim());
  }
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(body.slice(first, last + 1));
  // Prose with its own brace ("the {translation}:") hides the envelope from the span above.
  const keyed = body.search(/\{\s*"translation"\s*:/);
  if (keyed > first && last > keyed) candidates.push(body.slice(keyed, last + 1));

  for (const c of candidates) {
    try {
      const o = parseLenient(c) as Record<string, unknown>;
      const translation =
        coerceTranslation(o['translation']) ??
        (o['translation'] == null && typeof o['explain'] === 'string' ? '' : undefined);
      if (translation !== undefined) {
        const detectedLang = typeof o['detectedLang'] === 'string' ? o['detectedLang'] : undefined;
        const detectedDetail =
          typeof o['detectedDetail'] === 'string' && o['detectedDetail'].length < 200
            ? o['detectedDetail']
            : undefined;
        const detectedLangs = parseDetectedLangs(o['detectedLangs']);
        const explain = typeof o['explain'] === 'string' ? o['explain'] : undefined;
        const confidence = toConfidence(o['confidence']);
        return {
          translation,
          ...(confidence !== undefined ? { confidence } : {}),
          ...(detectedLang !== undefined ? { detectedLang } : {}),
          ...(detectedDetail !== undefined ? { detectedDetail } : {}),
          ...(detectedLangs !== undefined ? { detectedLangs } : {}),
          ...(explain !== undefined ? { explain } : {}),
        };
      }
    } catch (e) {
      debugCatch(e, 'shared.backends.base.1');
    }
  }
  // One-pass scan recovers {"translation":"hello wor — regex would backtrack on long accumulators.
  const partial = extractPartialTranslation(body);
  if (partial !== null) return { translation: partial };
  // An incomplete JSON envelope returns empty, or the UI flashes `{` and `{"t` before the partial-quote regex catches up.
  return { translation: envelopeArriving(body) ? '' : body.trim() };
}

/** The 'translation' value so far, or null before the key appears; an unclosed quote reads to end of input. */
function extractPartialTranslation(body: string): string | null {
  const keyIdx = body.indexOf('"translation"');
  if (keyIdx === -1) return null;
  let i = keyIdx + '"translation"'.length;
  while (i < body.length && (body[i] === ' ' || body[i] === '\t')) i++;
  if (body[i] !== ':') return null;
  i++;
  while (i < body.length && (body[i] === ' ' || body[i] === '\t')) i++;
  if (body[i] !== '"') return null;
  i++;
  let out = '';
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') {
      const n = body[i + 1];
      if (n === 'u') {
        const hex = body.slice(i + 2, i + 6);
        // A truncated body can end inside the escape; four digits are all or nothing.
        if (hex.length < 4) break;
        if (HEX4.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
      }
      if (n === '"') out += '"';
      else if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === '\\') out += '\\';
      else if (n !== undefined) out += n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}

const HEX4 = /^[0-9a-f]{4}$/i;

type ScanPhase = 'key' | 'colon' | 'quote' | 'body' | 'done' | 'dead';

/** Incremental extractPartialTranslation: each feed reads only new bytes, so a stream costs one pass, not one per delta. */
export function createStringValueScan(key = 'translation'): {
  feed: (body: string) => string | null;
  closedAt: () => number;
} {
  const quotedKey = JSON.stringify(key);
  let phase: ScanPhase = 'key';
  let cursor = 0;
  let out = '';
  let closeIdx = -1;

  function skipBlanks(body: string): void {
    while (cursor < body.length && (body[cursor] === ' ' || body[cursor] === '\t')) cursor++;
  }

  function feed(body: string): string | null {
    if (phase === 'dead') return null;
    if (phase === 'done') return out;
    if (phase === 'key') {
      const at = body.indexOf(quotedKey, cursor);
      if (at === -1) {
        // The key itself can straddle two deltas, so keep its last characters in play.
        cursor = Math.max(0, body.length - quotedKey.length + 1);
        return null;
      }
      cursor = at + quotedKey.length;
      phase = 'colon';
    }
    if (phase === 'colon') {
      skipBlanks(body);
      if (cursor >= body.length) return null;
      if (body[cursor] !== ':') {
        phase = 'dead';
        return null;
      }
      cursor++;
      phase = 'quote';
    }
    if (phase === 'quote') {
      skipBlanks(body);
      if (cursor >= body.length) return null;
      if (body[cursor] !== '"') {
        phase = 'dead';
        return null;
      }
      cursor++;
      phase = 'body';
    }
    while (cursor < body.length) {
      const c = body[cursor];
      if (c === '\\') {
        const n = body[cursor + 1];
        // A half-arrived escape resumes on the next feed.
        if (n === undefined) return out;
        if (n === 'u') {
          const hex = body.slice(cursor + 2, cursor + 6);
          if (hex.length < 4) return out;
          if (HEX4.test(hex)) {
            out += String.fromCharCode(Number.parseInt(hex, 16));
            cursor += 6;
            continue;
          }
        }
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
        cursor += 2;
        continue;
      }
      if (c === '"') {
        phase = 'done';
        closeIdx = cursor;
        return out;
      }
      out += c;
      cursor++;
    }
    return out;
  }

  return { feed, closedAt: () => closeIdx };
}

/** Last non-blank character. `trimEnd()` copies the whole accumulator on every delta. */
export function lastNonBlank(s: string): string {
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') return c ?? '';
  }
  return '';
}

/** First non-blank character. */
function firstNonBlank(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') return c ?? '';
  }
  return '';
}

/** One memo per request: a module-level slot thrashes when two streams run at once. */
export function createMemoizedJsonParser(): (body: string) => ParsedResult {
  let lastBody = '';
  let lastResult: ParsedResult | null = null;
  let scan = createStringValueScan();

  return (body: string): ParsedResult => {
    if (lastResult !== null && body === lastBody) return lastResult;
    // A retry or a new turn replaces the accumulator instead of extending it.
    if (!body.startsWith(lastBody)) scan = createStringValueScan();
    lastBody = body;
    const partial = scan.feed(body);
    const tail = lastNonBlank(body);
    const closed = scan.closedAt();
    const complete = tail === '}' || tail === '`' || (closed >= 0 && body.includes('}', closed));
    // Only the full parse reads confidence / detectedLang / explain, so it waits for a closable envelope.
    lastResult = complete
      ? parseJsonResponse(body)
      : partial !== null
        ? { translation: partial }
        : { translation: envelopeArriving(body) ? '' : body.trim() };
    return lastResult;
  };
}

/** A closed envelope naming `translation` is an answer even when the value is empty — an
 *  image with no readable text answers exactly that. A body that never closed one is not. */
export function carriesAnswer(raw: string, parsed: ParsedResult): boolean {
  if (parsed.translation !== '' || parsed.explain !== undefined) return true;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last < first) return false;
  try {
    const o = parseLenient(raw.slice(first, last + 1)) as Record<string, unknown>;
    return coerceTranslation(o['translation']) !== undefined;
  } catch {
    return false;
  }
}

/** Visible text mid-stream: the parsed translation when present; otherwise empty for a `{`- or fence-led body (no raw flash), else the raw text. */
export function streamingTranslation(rawAcc: string, parsed: ParsedResult): string {
  if (parsed.translation) return parsed.translation;
  const lead = firstNonBlank(rawAcc);
  return lead === '{' || lead === '`' ? '' : rawAcc;
}
