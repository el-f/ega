import type { TaskEffort as EffortLevel } from '../settings-schema';
import { DEFAULT_OLLAMA_URL } from '../constants';
import { isLoopbackUrl } from '../loopback-url';
import { clampEffort } from './sampling-caps';

/** What `/api/show` says about one model; a field an older daemon does not send stays undefined. */
export interface OllamaModelCaps {
  vision?: boolean;
  /** `thinking.values` (Ollama 0.34.3+): `[false, true]` for an on/off thinker, level names for gpt-oss. */
  thinkingValues?: readonly (boolean | string)[];
  contextLength?: number;
}

export function ollamaBaseUrl(ollamaUrl: string | undefined): string {
  const raw = (ollamaUrl ?? DEFAULT_OLLAMA_URL).trim();
  // Re-check at the sink so a write path that skips the schema cannot probe other local services.
  const url = isLoopbackUrl(raw) ? raw : DEFAULT_OLLAMA_URL;
  return url.replace(/\/+$/, '');
}

const SHOW_TTL_MS = 10 * 60_000;
const shown = new Map<string, { at: number; caps: OllamaModelCaps }>();

function parseShow(body: unknown): OllamaModelCaps {
  const j = (body ?? {}) as {
    capabilities?: unknown;
    thinking?: { values?: unknown };
    model_info?: Record<string, unknown>;
  };
  const caps: OllamaModelCaps = {};
  if (Array.isArray(j.capabilities)) caps.vision = j.capabilities.includes('vision');
  const values = j.thinking?.values;
  if (Array.isArray(values)) {
    caps.thinkingValues = values.filter(
      (v): v is boolean | string => typeof v === 'boolean' || typeof v === 'string',
    );
  } else if (Array.isArray(j.capabilities)) {
    caps.thinkingValues = j.capabilities.includes('thinking') ? [false, true] : [false];
  }
  for (const [k, v] of Object.entries(j.model_info ?? {})) {
    if (k.endsWith('.context_length') && typeof v === 'number' && v > 0) caps.contextLength = v;
  }
  return caps;
}

/** `/api/show` for one model, kept 10 minutes; null when the daemon does not answer in time, so callers keep today's behaviour. */
export async function fetchOllamaModelCaps(
  baseUrl: string,
  model: string,
  timeoutMs: number,
): Promise<OllamaModelCaps | null> {
  const key = `${baseUrl}\n${model}`;
  const hit = shown.get(key);
  if (hit && Date.now() - hit.at < SHOW_TTL_MS) return hit.caps;
  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const caps = parseShow(await res.json());
    shown.set(key, { at: Date.now(), caps });
    return caps;
  } catch {
    return null;
  }
}

export function resetOllamaModelCapsForTest(): void {
  shown.clear();
}

const LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high'];

/** The Effort levels a model can tell apart: its own level names, or Off and High for an on/off thinker. */
export function ollamaEfforts(caps: OllamaModelCaps | null): readonly EffortLevel[] {
  const values = caps?.thinkingValues;
  if (!values) return [];
  const named = LEVELS.filter((l) => values.includes(l));
  if (named.length > 0) return named;
  if (!values.includes(true)) return [];
  return values.includes(false) ? ['off', 'high'] : ['high'];
}

/** The `think` value a request sends: false keeps a thinking model quiet, as ega did before Effort reached Ollama. */
export function ollamaThink(
  caps: OllamaModelCaps | null,
  asked: EffortLevel,
): { think: boolean | string; level: EffortLevel | null } {
  const allowed = ollamaEfforts(caps);
  const level = clampEffort(asked, allowed);
  if (level === null || level === 'off') return { think: false, level };
  return { think: allowed.includes('low') || allowed.includes('medium') ? level : true, level };
}

/** Fixed per daemon so the loaded runner is never reloaded between ega requests; 8192 fits ega's history budget. */
const OLLAMA_NUM_CTX = 8192;

export function ollamaNumCtx(caps: OllamaModelCaps | null): number {
  return Math.min(caps?.contextLength ?? OLLAMA_NUM_CTX, OLLAMA_NUM_CTX);
}

/** One `/api/tags` row, as the model picker labels it. */
export interface OllamaTagRow {
  name: string;
  vision: boolean;
  thinking: boolean;
  /** A cloud model: the prompt runs on ollama.com. */
  cloud: boolean;
}

export function parseOllamaTags(body: unknown): OllamaTagRow[] {
  const models = (body as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  return models.flatMap((m: { name?: unknown; capabilities?: unknown; remote_host?: unknown }) => {
    if (typeof m.name !== 'string' || m.name === '') return [];
    const caps: unknown[] = Array.isArray(m.capabilities) ? m.capabilities : [];
    const remote = typeof m.remote_host === 'string' && m.remote_host !== '';
    return [
      {
        name: m.name,
        vision: caps.includes('vision'),
        thinking: caps.includes('thinking'),
        cloud: remote || isOllamaCloudName(m.name),
      },
    ];
  });
}

export function isOllamaCloudName(model: string): boolean {
  return /[:-]cloud$/i.test(model);
}

/** Ollama's own tag words, so the picker reads like `ollama list` and its site. */
export function ollamaModelLabel(row: OllamaTagRow): string {
  const tags = [
    ...(row.cloud ? ['cloud'] : []),
    ...(row.vision ? ['vision'] : []),
    ...(row.thinking ? ['thinking'] : []),
  ];
  return tags.length > 0 ? `${row.name} (${tags.join(', ')})` : row.name;
}
