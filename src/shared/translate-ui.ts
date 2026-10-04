import type { BackendId, LangSelection, PageContext } from '@/shared/types';
import type { Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import type { ChatTurn } from '@/shared/chat-history';
import { instantiateAll } from '@/shared/backends/registry';
import { probeAll } from '@/shared/backends/probe-all';
import { computeBackendOrder } from '@/shared/backends/select';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { getSettings } from '@/shared/storage';
import type { Msg } from '@/shared/messages';

// Backend wiring for translate: the service worker probes through it, the side panel sends through it.

export interface ProbeResult {
  /** Per-backend availability — keyed by registered backend id. */
  available: Record<string, boolean>;
  /** Backend the router will pick next, or null when nothing is ready. */
  active: BackendId | null;
}

/** Probe the backends on the translate chain and name the first reachable one; a backend the user turned off is never contacted. */
export async function defaultProbe(): Promise<ProbeResult> {
  const s = await getSettings();
  const cfg = buildBackendConfig(s);
  const allBackends = instantiateAll();
  // The chain the router walks, so "Active: X" cannot name a backend that never runs.
  const chain = computeBackendOrder(
    s,
    allBackends.map((b) => b.id),
  );
  const onChain = new Set(chain);
  const probed = await probeAll(
    allBackends.filter((b) => onChain.has(b.id)),
    cfg,
  );
  const map: Record<string, boolean> = {};
  for (const b of allBackends) map[b.id] = onChain.has(b.id) && probed[b.id] === true;
  const active = chain.find((id) => map[id] === true) ?? null;
  return { available: map, active };
}

export async function sendTranslateStart(args: {
  requestId: string;
  text: string;
  sourceLang: LangSelection;
  /** Absent ⇒ the router fills it from `settings.defaultTargetLang`. */
  targetLang?: LangSelection;
  explain: boolean;
  stream: boolean;
  /** Operation to run. Absent ⇒ 'translate'. */
  task?: TaskId;
  /** Tone modifier for Reword. Ignored by other tasks. */
  tone?: Tone;
  /** Page-level context. Absent for surfaces that ship none. */
  context?: PageContext;
  /** Refinement for this request only — hits the system prompt and the cache key, never persisted. */
  refinement?: string;
  /** Prior conversation turns, oldest-first. Absent on the first send. */
  conversationHistory?: ChatTurn[];
  /** Attached image (data: or http(s) URL). Routes through a vision backend. */
  imageUrl?: string;
}): Promise<void> {
  await chrome.runtime.sendMessage({
    kind: 'translate:start',
    requestId: args.requestId,
    text: args.text,
    sourceLang: args.sourceLang,
    ...(args.targetLang ? { targetLang: args.targetLang } : {}),
    ...(args.context ? { context: args.context } : {}),
    options: {
      stream: args.stream,
      explain: args.explain,
      // exactOptionalPropertyTypes: an unset key must be absent, not undefined.
      ...(args.task && args.task !== 'translate' ? { task: args.task } : {}),
      ...(args.tone ? { tone: args.tone } : {}),
      ...(args.refinement ? { refinement: args.refinement } : {}),
      ...(args.conversationHistory ? { conversationHistory: args.conversationHistory } : {}),
      ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
    },
  } satisfies Msg);
}

export function sendTranslateCancel(requestId: string): void {
  void chrome.runtime
    .sendMessage({ kind: 'translate:cancel', requestId } satisfies Msg)
    .catch(() => {});
}
