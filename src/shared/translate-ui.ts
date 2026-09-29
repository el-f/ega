import type { BackendId, LangSelection, PageContext } from '@/shared/types';
import type { Task, Tone } from '@/shared/task-prompts';
import type { ChatTurn } from '@/shared/chat-history';
import { instantiateAll } from '@/shared/backends/registry';
import { probeAll } from '@/shared/backendSelector';
import { resolveChainForTask } from '@/shared/backends/select';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { getSettings } from '@/shared/storage';
import type { Msg } from '@/shared/messages';

// Backend wiring for translate, shared between Popup.svelte and SidePanel.svelte.

export interface ProbeResult {
  /** Per-backend availability — keyed by registered backend id. */
  available: Record<string, boolean>;
  /** Backend the router will pick next, or null when nothing is ready. */
  active: BackendId | null;
}

/** Probe every configured backend and name the first reachable id on the translate chain. */
export async function defaultProbe(): Promise<ProbeResult> {
  const s = await getSettings();
  const cfg = buildBackendConfig(s);
  const allBackends = instantiateAll();
  const map = await probeAll(allBackends, cfg);
  // The chain the router walks for translate, pin included, so "Active: X" cannot name a backend that never runs.
  const chain = resolveChainForTask(
    {
      backendOrder: s.backendOrder,
      disabledBackends: s.disabledBackends,
      taskBackendChains: s.advanced.taskBackendChains,
      taskBackends: s.taskBackends,
    },
    'translate',
    allBackends.map((b) => b.id),
  );
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
  task?: Task;
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
