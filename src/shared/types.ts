import type { Task, Tone } from './task-prompts';
import type { VarietyEditFromSchema } from './settings-schema';
import type { BackendId, LangPresetId, LangSelection } from './brands';
import type { ChatTurn } from './chat-history';

export type { BackendId, LangPresetId, LangSelection };

export const ALL_ERR_CODES = [
  'NETWORK',
  'SERVER',
  'AUTH',
  'RATE_LIMIT',
  'QUOTA',
  'REQUEST',
  'NATIVE_NOT_INSTALLED',
  'NATIVE_SPAWN_FAIL',
  'ABORTED',
  'TIMEOUT',
  'PARSE',
  'PROTOCOL',
  'UNSUPPORTED',
  'IMAGE_UNSUPPORTED',
  'NO_BACKEND',
  'UNKNOWN',
] as const;

export type ErrCode = (typeof ALL_ERR_CODES)[number];

export interface PageContext {
  pageTitle?: string;
  pageUrl?: string;
  /** <html lang=""> or og:locale. */
  pageLang?: string;
  /** <meta name="description"> or og:description (capped at collection time). */
  pageDescription?: string;
  /** og:site_name, or <meta name="application-name">. */
  siteName?: string;
  /** Nearest h1→h6 ancestry walking up from the selection anchor. At most headingTrailDepth entries (default 3), each at most headingTrailEntryCap chars (default 120). Outermost first. */
  headingTrail?: string[];
  beforeText?: string;
  afterText?: string;
  /** Text of the post block around the selection (body, caption); rich mode only. */
  postText?: string;
}

export interface TranslationRequest {
  id: string;
  text: string;
  sourceLang: LangSelection;
  /** ISO 639-1/3 code or variety id; callers default it to settings.defaultTargetLang. */
  targetLang: LangSelection;
  context?: PageContext;
  /** Host of the tab the request came from, set by the dispatcher; site rules match on it even with page context off. */
  pageHost?: string;
  options: {
    stream: boolean;
    explain: boolean;
    /** Absent means translate; any other value routes through `buildTaskTemplate`. */
    task?: Task;
    /** Reword only; buildTaskTemplate defaults it to 'neutral'. */
    tone?: Tone;
    /** Side-panel refine instruction for this request only: in the prompt and the cache key, never in settings. */
    refinement?: string;
    /** Fetched by the router (SSRF-guarded) for a vision backend; the text path runs when none is configured. */
    imageUrl?: string;
    /** Prior conversation turns, oldest-first. Absent on the first turn. */
    conversationHistory?: ChatTurn[];
    /** One block of a page translate. The audit log keeps only a few of these, so a page cannot evict every interactive row. */
    batch?: boolean;
  };
}

/** One variety in a mixed-source result; id is a preset id or 'other'. */
export interface DetectedVariety {
  id: string;
  detail?: string;
}

/** Inspector metadata on the done chunk when captureResultMeta is on; usage fields are optional. */
export interface ResultMeta {
  backendId: BackendId | 'unknown';
  cacheHit: boolean;
  /** Wall-clock ms from router-start to terminal chunk. */
  latencyMs: number;
  /** Router start to first delta; absent for a single-chunk answer or cache hit. */
  firstTokenMs?: number;
  /** One entry per backend.translate call when the router walked the chain; the
   *  last entry always produced the surfaced result. */
  attempts?: ResultAttempt[];
  /** Model that produced the answer; a cache hit carries the original model. */
  modelId?: string;
  /** Source variety / language as the user requested it ('auto',
   *  'arabizi', 'en', …). */
  sourceLang?: string;
  /** Target ISO / variety the user asked for. */
  targetLang?: string;
  /** Copy of the done chunk's detectedLang, so the Inspector needs no extra wiring. */
  detectedLang?: string;
  detectedDetail?: string;
  /** Full multi-variety detection list when the source mixed
   *  varieties. */
  detectedLangs?: DetectedVariety[];
  /** Explain output from the LLM when explain was requested. */
  explain?: string;
  /** Provider-reported prompt token count. Absent on backends that don't
   *  return usage and on cache hits (a replay has no new token spend). */
  inputTokens?: number;
  /** Provider-reported completion token count. Absent like inputTokens. */
  outputTokens?: number;
  /** Anthropic only: prompt tokens read from the prompt cache. */
  cacheReadTokens?: number;
}

/** Provider token counts from the done chunk; any subset may be missing. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
}

export interface ResultAttempt {
  backendId: BackendId;
  status: 'ok' | 'error';
  /** Error code when status === 'error'; absent on success. */
  code?: string;
  /** Upstream message, truncated to keep the drawer readable. */
  message?: string;
  /** Per-attempt wall clock — entry to terminal. */
  latencyMs: number;
}

export type TranslationChunk =
  | { type: 'delta'; requestId: string; text: string }
  | {
      type: 'done';
      requestId: string;
      /** Absent when the provider never reported one — renderers hide the
       *  pill instead of showing a synthesized number. */
      confidence?: number;
      detectedLang?: string;
      /** Sub-variety label like 'Levantine'; detectedLang holds the preset id or 'other'. */
      detectedDetail?: string;
      /** Only for mixed sources; with 2+ entries render these pills instead of detectedLang. */
      detectedLangs?: DetectedVariety[];
      explain?: string;
      /** Set by the router on done unless settings.captureResultMeta is false. */
      meta?: ResultMeta;
      /** Provider token counts; the router copies them onto meta. */
      usage?: TokenUsage;
      /** Set when the explanation really used the image; drives the 'from image' marker. */
      usedImage?: boolean;
    }
  | {
      type: 'error';
      requestId: string;
      code: ErrCode;
      message: string;
      /** Server Retry-After on 429/529; page translate uses it as a backoff floor. */
      retryAfterMs?: number;
    };

export interface LangPreset {
  id: LangPresetId;
  label: string;
  hint: string;
  examples: Array<{ src: string; tgt: string }>;
  autoDetect?: { regex: string; flags: string; minScore: number };
}

export interface CustomLanguage {
  id: LangPresetId;
  label: string;
  hint: string;
  examples: Array<{ src: string; tgt: string }>;
  autoDetect?: { regex: string; flags: string; minScore: number };
  createdAt: number;
}

/** User edits to a variety. `label` is ignored for built-ins — their brand label is
 *  immutable. Derived from `varietyEditSchema` so validator and type cannot drift. */
export type VarietyEdit = VarietyEditFromSchema;

/** Built-ins (BUILT_IN_PRESETS + varietyOverrides) and customs (ega.customLanguages) in one shape. */
export interface Variety {
  id: LangPresetId;
  label: string;
  hint: string;
  examples: Array<{ src: string; tgt: string }>;
  autoDetect?: { regex: string; flags: string; minScore: number };
  kind: 'builtin' | 'custom';
  disabled: boolean;
  /** True when this built-in has user overrides applied (so the UI can
   *  show a "Reset" affordance). Always false for customs. */
  hasOverrides: boolean;
  /** Customs only — epoch ms. */
  createdAt?: number;
}

/** Wire shape produced by exportVarieties() and read back by the options import parser.
 *  Derived from varietiesBundleSchema — do not maintain manually. */
export type { VarietiesBundle } from '@/shared/settings-schema';

/** Summary of what an import wrote, returned to the UI for the toast. */
export interface VarietiesImportResult {
  customLanguagesAdded: number;
  varietyOverridesApplied: number;
  disabledVarietiesApplied: number;
  /** Built-in ids the bundle had overrides for that are no longer shipped. */
  droppedDanglingOverrides: string[];
  /** Disabled-list ids that aren't in the merged custom + built-in set. */
  droppedUnknownDisabled: string[];
  /** Custom entries that failed schema validation and were skipped. */
  skippedMalformedCustoms: number;
  /** Custom entries dropped because the id repeats a built-in or an earlier entry. */
  droppedCollidingCustoms: number;
}

/** Wire shape produced by exportTaskPresets() and read back by the options import parser.
 *  Derived from taskPresetsBundleSchema — do not maintain manually. */
export type { TaskPresetsBundle } from '@/shared/settings-schema';

/** Summary of what a task-presets import wrote, returned to the UI for the toast. */
export interface TaskPresetsImportResult {
  taskTemplatesApplied: number;
  taskBackendsApplied: number;
  taskTemperaturesApplied: number;
  /** Backend ids referenced in the bundle that aren't currently registered.
   *  These entries are dropped during import and surfaced for UI feedback. */
  droppedUnknownBackends: string[];
}

export interface SitePref {
  /** Hard off-switch — Ega does nothing on this host. */
  disabled: boolean;
  /** Per-site source-language override; falls back to global default. */
  defaultLang?: LangSelection;
  /** Last direction translated on this site, written by maybeMemoDirection; not user-editable. */
  lastDirection?: { source: LangSelection; target: LangSelection };
}

export interface PromptTemplate {
  system: string;
  user: string;
}

/** Inferred from settingsSchema; the storage layer strips undefined, so optional fields read as absent keys. */
export type { SettingsFromSchema as Settings } from './settings-schema';
