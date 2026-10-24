// The one meta line under a reply, shared by the side panel and the tooltip (cross-spec X3, X8, X11).
import type { DetectedVariety, ResultMeta } from '@/shared/types';
import { formatDetectedLabel } from '@/shared/detected-label';
import { modelDisplayName } from '@/shared/model-names';
import { backendLabel } from '@/shared/backends/provider-profiles';

export type MetaItemKey =
  | 'status'
  | 'bookmarked'
  | 'answered-by'
  | 'failed'
  | 'direction'
  | 'version'
  | 'model'
  | 'confidence';

export interface MetaItem {
  key: MetaItemKey;
  text: string;
  /** Drawn in the warning colour. */
  warn?: true;
}

/** Below this the line says "Low confidence" in the warning colour. */
const LOW_CONFIDENCE = 0.6;

type VarietyLike = { id: string; label: string };

/** "Arabizi — Levantine" reads "Arabizi (Levantine)" in the line; a detail with its own parens keeps the dash. */
function langName(
  id: string,
  detail: string | undefined,
  varieties: readonly VarietyLike[],
): string {
  const label = formatDetectedLabel(id, detail, varieties);
  const m = /^(.+?) — (.+)$/.exec(label);
  return m && !(m[2] ?? '').includes('(') ? `${m[1]} (${m[2]})` : label;
}

export interface DirectionInput {
  /** What the model said the text was; two or more for mixed text. */
  detected?: readonly DetectedVariety[];
  /** The source the request named; 'auto' names none. */
  sourceLang?: string;
  targetLang?: string;
  /** Reword and Grammar answer in the input's language, so only the source shows. */
  sourceOnly?: boolean;
  varieties?: readonly VarietyLike[];
  /** The one-line meta: the whole direction is cut at META_DIRECTION_MAX characters, the target last. About shows the full line. */
  short?: boolean;
}

/** A model-written detail (or an older reply's cue-word list) must not push the direction off the meta line at 320px. */
const META_DIRECTION_MAX = 48;
/** A custom target language's label leaves the source part some room. */
const META_TARGET_MAX = 32;
const ARROW = ' → ';

function shortName(name: string, max: number): string {
  if (name.length <= max) return name;
  // Graphemes, so a cut never splits a flag or a skin-tone emoji in a custom language's label.
  const chars = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name),
    (s) => s.segment,
  );
  if (chars.length <= max) return name;
  let head = chars.slice(0, max - 1).join('');
  // Drop a word the cut would leave half shown, unless it is the only word.
  if (/[\p{L}\p{N}]/u.test(chars[max - 1] ?? '')) {
    const whole = head.replace(/[\p{L}\p{M}\p{N}]+$/u, '');
    if (whole.trim() !== '') head = whole;
  }
  return head.replace(/[\s,;:(—–+-]+$/u, '') + '…';
}

/** A reply's detection fields as one list; a detail with no language is the name itself ("other"). */
export function detectedVarieties(r: {
  detectedLang?: string | undefined;
  detectedDetail?: string | undefined;
  detectedLangs?: readonly DetectedVariety[] | undefined;
}): DetectedVariety[] {
  if (r.detectedLangs !== undefined && r.detectedLangs.length > 0) return [...r.detectedLangs];
  const detail = r.detectedDetail !== undefined && r.detectedDetail !== '' ? r.detectedDetail : '';
  const id = r.detectedLang !== undefined && r.detectedLang !== '' ? r.detectedLang : 'other';
  if (id === 'other' && detail === '') return [];
  return [detail !== '' ? { id, detail } : { id }];
}

/** "Arabizi (Levantine) → English", "Arabizi + English → Hebrew", past two names "+1". Empty when nothing is known. */
export function directionLabel(input: DirectionInput): string {
  const varieties = input.varieties ?? [];
  const names = (input.detected ?? [])
    .map((d) => langName(d.id, d.detail, varieties))
    .filter((n) => n !== '');
  let from: string;
  if (names.length > 0) {
    from = names.slice(0, 2).join(' + ') + (names.length > 2 ? ` +${names.length - 2}` : '');
  } else if (input.sourceLang !== undefined && input.sourceLang !== 'auto') {
    from = langName(input.sourceLang, undefined, varieties);
  } else {
    return '';
  }
  const to =
    input.sourceOnly === true || input.targetLang === undefined || input.targetLang === ''
      ? ''
      : langName(input.targetLang, undefined, varieties);
  if (input.short !== true) return to === '' ? from : from + ARROW + to;
  if (to === '') return shortName(from, META_DIRECTION_MAX);
  const shortTo = shortName(to, META_TARGET_MAX);
  return shortName(from, META_DIRECTION_MAX - ARROW.length - shortTo.length) + ARROW + shortTo;
}

export interface ConfidenceSetting {
  /** The "Confidence" switch; off hides it everywhere. */
  show: boolean;
  /** "Hide below" from Settings, 0 to 1. */
  threshold: number;
}

export interface ReplyMetaInput {
  /** One status, already worded: "Partial answer", "Version 2 loading…", "Reading aloud". */
  status?: string;
  bookmarked?: boolean;
  /** Absent when "Record request details" is off; then no model and no fallback show. */
  meta?: ResultMeta | undefined;
  direction?: string;
  /** What made this version: "Shorter", "Your change", "As Explain". */
  version?: string;
  confidence?: number | undefined;
  confidenceSetting?: ConfidenceSetting;
}

/** The confidence item, or null when the setting hides it. */
export function confidenceItem(
  value: number | undefined,
  setting: ConfidenceSetting,
): MetaItem | null {
  if (!setting.show || value === undefined || !(value > 0) || value < setting.threshold) {
    return null;
  }
  const pct = Math.round(value * 100);
  return value < LOW_CONFIDENCE
    ? { key: 'confidence', text: `Low confidence (${pct}%)`, warn: true }
    : { key: 'confidence', text: `${pct}% confident` };
}

/**
 * Items in priority order. The line clips from the end, so confidence goes first when space runs out (X3),
 * then the model. Every item is also in About this reply.
 */
export function replyMetaItems(input: ReplyMetaInput): MetaItem[] {
  const out: MetaItem[] = [];
  if (input.status !== undefined && input.status !== '') {
    out.push({ key: 'status', text: input.status });
  }
  if (input.bookmarked === true) out.push({ key: 'bookmarked', text: 'Bookmarked' });
  const meta = input.meta;
  const attempts = meta?.attempts ?? [];
  const first = attempts[0];
  if (meta !== undefined && !meta.cacheHit && attempts.length > 1 && first !== undefined) {
    out.push({ key: 'answered-by', text: `Answered by ${backendLabel(meta.backendId)}` });
    out.push({ key: 'failed', text: `${backendLabel(first.backendId)} failed` });
  }
  if (input.direction !== undefined && input.direction !== '') {
    out.push({ key: 'direction', text: input.direction });
  }
  if (input.version !== undefined && input.version !== '') {
    out.push({ key: 'version', text: input.version });
  }
  if (meta?.cacheHit === true) out.push({ key: 'model', text: 'Saved answer' });
  else if (meta?.modelId !== undefined && meta.modelId !== '') {
    out.push({ key: 'model', text: modelDisplayName(meta.modelId) });
  }
  const conf =
    input.confidenceSetting === undefined
      ? null
      : confidenceItem(input.confidence, input.confidenceSetting);
  if (conf !== null) out.push(conf);
  return out;
}
