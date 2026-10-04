import {
  EFFORT_LEVELS,
  defaultModelId,
  type TaskEffort as EffortLevel,
} from '@/shared/settings-schema';

// The start anchor rejects `gpt-4o` (its `o` follows `gpt-4`); `gpt-5-chat*` is a chat-tuned sibling, not reasoning.
const OPENAI_REASONING_RE =
  /^(?:o[1-9]\d*|gpt-(?:[5-9]|[1-9]\d+)(?:\.\d+)?)(?!-chat)(?:[^a-z0-9.]|$)/;

// The ChatGPT alias: no OpenAI page says it takes temperature or effort, and leaving both out cannot 400.
const OPENAI_CHAT_ALIAS_RE = /(?:^|-)chat-latest$/;

// reasoning_effort "none": gpt-5.1, gpt-5.2, gpt-5.6-luna, gpt-6-luna and gpt-6-sol. Astra and 6.1 Sol start at low.
const OPENAI_NONE_RE = /^gpt-(?:5\.[12]|5\.6-luna|6-(?:luna|sol))(?:[^a-z0-9.]|$)/;
// The first gpt-5 snapshots go down to "minimal", not "none".
const OPENAI_MINIMAL_RE = /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/;

// gpt-oss takes reasoning_effort low/medium/high and a temperature on every host ega lists.
const GPT_OSS_RE = /^gpt-oss-(?:20b|120b)(?::[a-z0-9-]+)?$/;
const GPT_OSS_HOSTS: ReadonlySet<string> = new Set(['groq', 'together', 'fireworks', 'openrouter']);

// grok-4.3 and later take reasoning_effort none/low/medium/high; older grok ids reject the field.
const XAI_EFFORT_RE = /^grok-(?:4\.(?:[3-9]|\d{2,})|[5-9])(?:[^a-z0-9.]|$)/;

function bareId(modelId: string): string {
  const id = modelId.trim().toLowerCase();
  return id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
}

/** True for OpenAI reasoning models (the o-series, gpt-5 and later); tolerates a `vendor/` prefix. */
export function isOpenAIReasoningModel(modelId: string): boolean {
  return OPENAI_REASONING_RE.test(bareId(modelId));
}

// Claude 3 and 4.x through 4.6 take temperature; Opus 4.7 and every later model return 400 on it.
const ANTHROPIC_SAMPLING_RE = /^claude-(?:3[-.]|(?:opus|sonnet|haiku)-4(?:-[0-6])?(?:-\d{8})?$)/;

// output_config.effort: Opus 4.5+, Sonnet 4.6+, Fable, Mythos. Haiku 4.5 and Sonnet 4.5 answer 400, and so may an unknown id.
const ANTHROPIC_EFFORT_RE =
  /^claude-(?:opus-4-[5-9]|sonnet-4-6|(?:opus|sonnet|fable|mythos)-[5-9](?:-\d)?|mythos-preview)(?:-\d{8})?$/;

// Gemini 1.x and 2.x are a closed set; every later id and the -latest aliases drop temperature, as Google asks.
const GEMINI_LEGACY_RE = /^gemini-[12]\./;
// Google lists MINIMAL for these; 3.7/3.8 Flash and 3.1 Pro answer 400 on it, and LOW works on every 3.x text model.
const GEMINI_MINIMAL_RE = /^gemini-(?:3\.[56]-flash|3\.1-flash-lite|3-flash-preview|robotics-er-2)/;

const FROM_LOW: readonly EffortLevel[] = ['low', 'medium', 'high'];

export interface SamplingSupport {
  temperature: boolean;
  maxTokens: boolean;
  /** The levels this (backend, model) can tell apart; empty when it takes no effort setting. */
  efforts: readonly EffortLevel[];
}

/** An empty slot runs as the backend's default model, so its caps are the default's. */
function effectiveModel(backendId: string, slot: string): string {
  return (slot.trim() || defaultModelId(backendId)).toLowerCase();
}

/** Which sampling knobs the active `(backend, model)` accepts; unknown ids get the base set. */
export function resolveSamplingSupport(backendId: string, slot: string): SamplingSupport {
  const id = effectiveModel(backendId, slot);
  const bare = bareId(id);
  if (backendId === 'native') return { temperature: false, maxTokens: false, efforts: [] };
  if (backendId === 'anthropic') {
    return {
      temperature: ANTHROPIC_SAMPLING_RE.test(id),
      maxTokens: true,
      efforts: ANTHROPIC_EFFORT_RE.test(id) ? FROM_LOW : [],
    };
  }
  if (backendId === 'gemini') {
    const legacy = GEMINI_LEGACY_RE.test(id) || id.endsWith('-latest');
    return {
      temperature: GEMINI_LEGACY_RE.test(id),
      maxTokens: true,
      efforts: legacy ? [] : GEMINI_MINIMAL_RE.test(id) ? EFFORT_LEVELS : FROM_LOW,
    };
  }
  if (backendId === 'openai' && OPENAI_CHAT_ALIAS_RE.test(bare)) {
    return { temperature: false, maxTokens: true, efforts: [] };
  }
  if (backendId === 'openai' && isOpenAIReasoningModel(id)) {
    const off = OPENAI_NONE_RE.test(bare) || OPENAI_MINIMAL_RE.test(bare);
    return { temperature: false, maxTokens: true, efforts: off ? EFFORT_LEVELS : FROM_LOW };
  }
  if (GPT_OSS_HOSTS.has(backendId) && GPT_OSS_RE.test(bare)) {
    return { temperature: true, maxTokens: true, efforts: FROM_LOW };
  }
  // The fallback when OpenRouter's model list is out of reach: it drops a field the model does not take.
  if (backendId === 'openrouter')
    return { temperature: true, maxTokens: true, efforts: EFFORT_LEVELS };
  if (backendId === 'xai' && XAI_EFFORT_RE.test(bare)) {
    return { temperature: true, maxTokens: true, efforts: EFFORT_LEVELS };
  }
  return { temperature: true, maxTokens: true, efforts: [] };
}

/** The allowed level nearest to the asked one; a tie goes up, so a model never thinks less than asked. */
export function clampEffort(
  asked: EffortLevel,
  allowed: readonly EffortLevel[],
): EffortLevel | null {
  if (allowed.length === 0) return null;
  const at = EFFORT_LEVELS.indexOf(asked);
  let best: EffortLevel | null = null;
  let bestGap = Infinity;
  for (const level of allowed) {
    const gap = Math.abs(EFFORT_LEVELS.indexOf(level) - at);
    if (gap < bestGap || (gap === bestGap && EFFORT_LEVELS.indexOf(level) > at)) {
      best = level;
      bestGap = gap;
    }
  }
  return best;
}

export interface ResolvedEffort {
  /** The level that runs after clamping. */
  level: EffortLevel;
  /** The provider's own value; null means send no field. */
  wire: string | null;
}

/** The effort a request sends, mapped to the backend's own name; null when the model takes no effort setting. */
export function resolveEffort(
  backendId: string,
  slot: string,
  asked: EffortLevel,
): ResolvedEffort | null {
  const level = clampEffort(asked, resolveSamplingSupport(backendId, slot).efforts);
  if (level === null) return null;
  const bare = bareId(effectiveModel(backendId, slot));
  if (backendId === 'gemini') {
    if (level === 'off') return { level, wire: 'MINIMAL' };
    return { level, wire: level.toUpperCase() };
  }
  if (level !== 'off') return { level, wire: level };
  if (backendId === 'openrouter') return { level, wire: null };
  if (backendId === 'openai' && OPENAI_MINIMAL_RE.test(bare)) return { level, wire: 'minimal' };
  return { level, wire: 'none' };
}

const HEADROOM: Readonly<Record<EffortLevel, number>> = {
  off: 0,
  low: 2048,
  medium: 4096,
  high: 8192,
};

/** Thinking spends the same output budget, so Max answer length stays the answer's length and reasoning gets room on top. */
export function withReasoningHeadroom(maxTokens: number, effort: ResolvedEffort | null): number {
  return maxTokens + (effort ? HEADROOM[effort.level] : 0);
}
