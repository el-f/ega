import type { FeatureProposal, FileVerdict, Issue, ProposalItem } from './types';

/** Longest balanced `{...}` that parses: a regex matches an inner object and drops `overall`. */
export function extractOuterJson(text: string): string | null {
  let best: string | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          try {
            JSON.parse(candidate);
            if (!best || candidate.length > best.length) best = candidate;
          } catch {
            /* not valid json; skip */
          }
          break;
        }
      }
    }
  }
  return best;
}

const AXIS_KEYS = [
  'density',
  'contrast',
  'hierarchy',
  'copy',
  'empty_state',
  'primitive_coherence',
  'theme_parity',
  'scrim',
  'overflow',
] as const;

type AxisKey = (typeof AXIS_KEYS)[number];

function isGrade(v: unknown): v is 'ok' | 'minor' | 'major' {
  return v === 'ok' || v === 'minor' || v === 'major';
}

/** Joins the assistant text of a stream-json run and notes whether its result envelope flagged an error. */
function assistantText(stream: string): { text: string; cliError: boolean } {
  const lines = stream.split('\n').filter((l) => l.trim().length);
  let text = '';
  let cliError = false;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      if (msg['type'] === 'result' && msg['is_error'] === true) cliError = true;
      if (msg['type'] === 'assistant') {
        const content = (
          msg['message'] as { content?: { type: string; text?: string }[] } | undefined
        )?.content;
        if (content)
          for (const c of content)
            if (c.type === 'text' && typeof c.text === 'string') text += c.text;
      }
    } catch {
      /* skip non-JSON */
    }
  }
  return { text, cliError };
}

export function parseClaudeStream(stream: string): Omit<FileVerdict, 'file' | 'surface' | 'state'> {
  const { text, cliError } = assistantText(stream);
  if (cliError && !text) return { issues: [], overall: 'cli-error', raw: stream };
  const m = extractOuterJson(text);
  if (!m) return { issues: [], overall: 'unparseable', raw: stream };
  try {
    const j = JSON.parse(m) as Record<string, unknown>;
    const result: Omit<FileVerdict, 'file' | 'surface' | 'state'> = {
      issues: Array.isArray(j['issues']) ? (j['issues'] as Issue[]) : [],
      overall: (j['overall'] as FileVerdict['overall']) ?? 'ok',
    };
    for (const k of AXIS_KEYS) {
      const v = j[k as AxisKey];
      if (isGrade(v)) result[k] = v;
    }
    return result;
  } catch {
    return { issues: [], overall: 'unparseable', raw: stream };
  }
}

// --- Feature proposal parser ---------------------------------------------

function coerceProposalItems(v: unknown): ProposalItem[] {
  if (!Array.isArray(v)) return [];
  const out: ProposalItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r['id'] === 'string' ? r['id'] : '';
    const what = typeof r['what'] === 'string' ? r['what'] : '';
    const why = typeof r['why'] === 'string' ? r['why'] : '';
    if (!id || !what) continue;
    const priorityRaw = r['priority'];
    const priority =
      priorityRaw === 'P0' || priorityRaw === 'P1' || priorityRaw === 'P2' ? priorityRaw : 'P2';
    const item: ProposalItem = { id, priority, what, why };
    const where = r['where'];
    if (Array.isArray(where)) item.where = where.filter((w): w is string => typeof w === 'string');
    const effort = r['effort'];
    if (effort === 'small' || effort === 'medium' || effort === 'large') item.effort = effort;
    const risk = r['risk'];
    if (risk === 'low' || risk === 'medium' || risk === 'high') item.risk = risk;
    out.push(item);
  }
  return out;
}

export function parseFeatureProposal(featureId: string, stream: string): FeatureProposal {
  const { text, cliError } = assistantText(stream);
  const base: FeatureProposal = {
    feature: featureId,
    generated_at: new Date().toISOString(),
    summary: '',
    must_haves: [],
    should_haves: [],
    could_haves: [],
    overhauls: [],
    robustness: [],
  };
  if (cliError && !text) return { ...base, cli_error: true, raw: stream };
  const m = extractOuterJson(text);
  if (!m) return { ...base, raw: stream };
  try {
    const j = JSON.parse(m) as Record<string, unknown>;
    return {
      ...base,
      summary: typeof j['summary'] === 'string' ? j['summary'] : '',
      must_haves: coerceProposalItems(j['must_haves']),
      should_haves: coerceProposalItems(j['should_haves']),
      could_haves: coerceProposalItems(j['could_haves']),
      overhauls: coerceProposalItems(j['overhauls']),
      robustness: coerceProposalItems(j['robustness']),
    };
  } catch {
    return { ...base, raw: stream };
  }
}
