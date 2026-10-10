import type { TaskEffort as EffortLevel } from '../settings-schema';
import { clampEffort } from './sampling-caps';

/** OpenRouter's own record of one model's reasoning, from its public model list. */
export interface OpenRouterReasoning {
  /** The model always thinks; OpenRouter rejects effort "none" for it. */
  mandatory: boolean;
  /** Whether the model thinks when the request names no effort; undefined when the list does not say. */
  defaultOn: boolean | undefined;
  /** The level the model runs at when the request names none. */
  defaultEffort: string | undefined;
  /** OpenRouter's effort names for the model: none, minimal, low, medium, high, xhigh, max. */
  efforts: readonly string[];
}

/** null: OpenRouter lists the model, and it takes no reasoning setting. */
type ReasoningMap = Record<string, OpenRouterReasoning | null>;

// Public and keyless (~0.8 MB). The whole list, so "takes no reasoning" differs from "newer than the copy".
const LIST_URL = 'https://openrouter.ai/api/v1/models';
const STORE_KEY = 'ega.openrouterReasoning';
const TTL_MS = 12 * 60 * 60_000;
const FAILED_TTL_MS = 5 * 60_000;

type Stored = { at: number; map: ReasoningMap; schemas?: readonly string[] } | { failedAt: number };

let memo: Stored | null = null;
let inFlight: Promise<ReasoningMap | null> | null = null;

export function parseOpenRouterModels(body: unknown): ReasoningMap {
  const data = (body as { data?: unknown } | null)?.data;
  const out: ReasoningMap = {};
  if (!Array.isArray(data)) return out;
  for (const m of data as Array<{
    id?: unknown;
    reasoning?: unknown;
    supported_parameters?: unknown;
  }>) {
    if (typeof m.id !== 'string' || m.id === '') continue;
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    if (!params.includes('reasoning') && m.reasoning == null) {
      out[m.id] = null;
      continue;
    }
    const r = (m.reasoning ?? {}) as {
      mandatory?: unknown;
      default_enabled?: unknown;
      default_effort?: unknown;
      supported_efforts?: unknown;
    };
    out[m.id] = {
      mandatory: r.mandatory === true,
      defaultOn: typeof r.default_enabled === 'boolean' ? r.default_enabled : undefined,
      defaultEffort: typeof r.default_effort === 'string' ? r.default_effort : undefined,
      efforts: Array.isArray(r.supported_efforts)
        ? r.supported_efforts.filter((e): e is string => typeof e === 'string')
        : [],
    };
  }
  return out;
}

function fresh(entry: Stored | null | undefined): ReasoningMap | null | undefined {
  if (!entry) return undefined;
  if ('failedAt' in entry) return Date.now() - entry.failedAt < FAILED_TTL_MS ? null : undefined;
  return Date.now() - entry.at < TTL_MS ? entry.map : undefined;
}

function remember(entry: Stored): void {
  memo = entry;
  // Session storage outlives the service worker, so a restart neither refetches nor waits again.
  void chrome.storage.session.set({ [STORE_KEY]: entry }).catch(() => undefined);
}

async function loadMap(timeoutMs: number): Promise<ReasoningMap | null> {
  const mem = fresh(memo);
  if (mem !== undefined) return mem;
  try {
    const stored = (await chrome.storage.session.get(STORE_KEY))[STORE_KEY] as Stored | undefined;
    const kept = fresh(stored);
    if (kept !== undefined && stored) {
      memo = stored;
      return kept;
    }
  } catch {
    // No session storage in this context: the network answer still works.
  }
  try {
    const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: Array<{ id?: unknown; supported_parameters?: unknown }>;
    };
    const map = parseOpenRouterModels(body);
    const schemas = Array.isArray(body.data)
      ? body.data
          .filter(
            (row) =>
              typeof row.id === 'string' &&
              Array.isArray(row.supported_parameters) &&
              row.supported_parameters.includes('structured_outputs'),
          )
          .map((row) => row.id as string)
      : [];
    remember({ at: Date.now(), map, schemas });
    return map;
  } catch {
    remember({ failedAt: Date.now() });
    return null;
  }
}

/** One model's record: undefined when the list is out of reach or does not name the model, null when it takes no reasoning setting. */
export async function fetchOpenRouterReasoning(
  model: string,
  timeoutMs: number,
): Promise<OpenRouterReasoning | null | undefined> {
  inFlight ??= loadMap(timeoutMs).finally(() => {
    inFlight = null;
  });
  const map = await inFlight;
  if (map === null) return undefined;
  // A routing suffix (:nitro, :floor, :online) is the same model; :free and :batch rows are listed on their own.
  for (const id of [model, model.replace(/:[^/:]*$/, '')]) {
    if (Object.hasOwn(map, id)) return map[id] ?? null;
  }
  return undefined;
}

export function resetOpenRouterReasoningForTest(): void {
  memo = null;
  inFlight = null;
}

/** Reuses the reasoning list; old session records conservatively omit schema support. */
export async function fetchOpenRouterSchema(model: string, timeoutMs: number): Promise<boolean> {
  await fetchOpenRouterReasoning(model, timeoutMs);
  const schemas = memo && 'map' in memo ? memo.schemas : undefined;
  return [model, model.replace(/:[^/:]*$/, '')].some((id) => schemas?.includes(id) === true);
}

const NAMED: readonly EffortLevel[] = ['low', 'medium', 'high'];

function thinksByDefault(r: OpenRouterReasoning): boolean {
  if (r.mandatory || r.defaultOn === true) return true;
  // The list leaves default_enabled out for some models that do think; a named default level says they do.
  return r.defaultOn === undefined && r.defaultEffort !== undefined && r.defaultEffort !== 'none';
}

/** OpenRouter lists the model as reasoning-capable and says nothing more about it. */
function bare(r: OpenRouterReasoning): boolean {
  return (
    !r.mandatory &&
    r.defaultOn === undefined &&
    r.defaultEffort === undefined &&
    r.efforts.length === 0
  );
}

/** The Effort levels a model can tell apart. Off needs a way to stay quiet: "none", "minimal", or turning reasoning off. */
export function openRouterEfforts(r: OpenRouterReasoning | null): readonly EffortLevel[] {
  if (!r) return [];
  const named = NAMED.filter((l) => r.efforts.includes(l));
  const canOff = !r.mandatory || r.efforts.includes('minimal');
  if (named.length > 0) return canOff ? ['off', ...named] : named;
  // A bare record says only that the model reasons; OpenRouter maps an unlisted level to the nearest one it takes.
  if (bare(r)) return ['off', 'low', 'medium', 'high'];
  // No level names: the model either thinks at its own level or not at all.
  return !r.mandatory && thinksByDefault(r) ? ['off', 'high'] : [];
}

export interface OpenRouterPlan {
  /** The level that runs; null when the model's level cannot be set. */
  level: EffortLevel | null;
  /** Body fields that carry the level. */
  fields: Record<string, unknown>;
  /** The level whose thinking room max_tokens gets; null for none. */
  room: EffortLevel | null;
}

/** What one OpenRouter request sends for the asked level, and how much thinking room it adds. */
export function openRouterPlan(r: OpenRouterReasoning | null, asked: EffortLevel): OpenRouterPlan {
  if (!r) return { level: null, fields: {}, room: null };
  const efforts = openRouterEfforts(r);
  const level = clampEffort(asked, efforts);
  const thinks = thinksByDefault(r);
  if (level === null) {
    // The model thinks at a level nobody can set: give it room for the asked level, at least Low.
    return { level, fields: {}, room: thinks ? (asked === 'off' ? 'low' : asked) : null };
  }
  if (level === 'off') {
    if (r.efforts.includes('none') && !r.mandatory) {
      return { level, fields: { reasoning_effort: 'none' }, room: null };
    }
    if (r.efforts.includes('minimal')) {
      return { level, fields: { reasoning_effort: 'minimal' }, room: 'low' };
    }
    // Room in case the model thinks anyway: not every provider honours turning it off.
    return {
      level,
      fields: { reasoning: { enabled: false } },
      room: thinks || bare(r) ? 'low' : null,
    };
  }
  // A bare record names no levels, so the level goes as asked and OpenRouter maps it.
  if (bare(r)) return { level, fields: { reasoning_effort: level }, room: level };
  if (!r.efforts.includes(level)) return { level, fields: {}, room: level };
  return { level, fields: { reasoning_effort: level }, room: level };
}
