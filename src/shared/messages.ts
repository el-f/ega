import type {
  DetectedVariety,
  ErrCode,
  LangSelection,
  PageContext,
  TranslationChunk,
} from './types';
import type { Task, Tone } from './task-prompts';
import type { AuditEntry, AuditSurface } from './audit-log';
import type { BackendConfig } from './backends/base';
import type { ChatTurn } from './chat-history';
import type { SettingsTab } from './settings-tabs';
import type { PatchAck } from './settings-bus';
import type { DescribeChangeResponse } from './template-rewrite';
import type { PortStatus } from './cli-session/port-manager';
import type { PerfEntry } from './perf-history';
import type { ProbeResult } from './translate-ui';
import type { PendingPopupHandoff } from './pending-popup-handoff';

export type Msg =
  | {
      kind: 'translate:start';
      requestId: string;
      text: string;
      sourceLang: LangSelection;
      /** Absent ⇒ `settings.defaultTargetLang`; 'auto' ⇒ whatever variety the LLM detects. */
      targetLang?: LangSelection;
      context?: PageContext;
      options: {
        stream: boolean;
        explain: boolean;
        /** Operation to run. Absent ⇒ 'translate'. */
        task?: Task;
        /** Tone modifier for Reword. Ignored by other tasks. */
        tone?: Tone;
        /** Instruction injected into the system prompt for this request only. Never persisted. */
        refinement?: string;
        /** Vision-explain image (see TranslationRequest.options.imageUrl). */
        imageUrl?: string;
        /** Prior conversation turns, oldest-first. Absent on the first turn. */
        conversationHistory?: ChatTurn[];
        /** One block of a page translate (see TranslationRequest.options.batch). */
        batch?: boolean;
      };
    }
  | { kind: 'translate:chunk'; chunk: TranslationChunk }
  | { kind: 'translate:cancel'; requestId: string }
  /** Sidepanel → SW: abort every in-flight translate, from any surface. */
  | { kind: 'translate:cancel-all' }
  | { kind: 'settings:update'; patch: Record<string, unknown> }
  /** Any surface → SW: write this entry. The SW is the only writer of the audit log. */
  | { kind: 'audit:push'; entry: Omit<AuditEntry, 'id' | 'ts'> }
  /** Options → SW: drop the whole log. Same writer, so it cannot land inside a batched push. */
  | { kind: 'audit:clear' }
  /** Audit log → sidepanel toaster. Emitted only for entries carrying an `error`. */
  | {
      kind: 'audit:append';
      entry: {
        error?: { code: string; message: string };
        task?: string;
        /** Lets a surface already showing this failure inline suppress the toast. */
        requestId?: string;
        /** Lets a side panel tell its own failure from a sibling window's. */
        surface?: AuditSurface;
      };
    }
  | { kind: 'backend:probe' }
  /** Popup / side panel → SW. Replies a `ProbeResult`; probing in the page would open a second native host. */
  | { kind: 'backend:probe-all' }
  | { kind: 'page:translateAll' }
  | { kind: 'ctx:translate-selection'; text?: string; task?: Task; targetLang?: LangSelection }
  | { kind: 'hotkey:translate' }
  | { kind: 'picker:enter' }
  /** A content script has no `chrome.runtime.openOptionsPage`, so the tab to land on rides the message. */
  | { kind: 'ui:open-options'; tab?: SettingsTab }
  | {
      kind: 'ui:open-sidepanel';
      /** The SW writes this to the handoff slot, so a content script needs no storage.session access. */
      handoff?: PendingPopupHandoff;
    }
  /** Sent by the image tooltip's Retry and by the e2e hook; the context menu calls dispatchImageTranslate directly. */
  | { kind: 'image:translate'; requestId: string; imageUrl: string; task?: 'translate' | 'explain' }
  /** Sent before a context-menu image translate: without a seeded turn the arriving chunks match nothing and vanish. */
  | {
      kind: 'sidepanel:seed-image-translate';
      requestId: string;
      imageUrl: string;
      task?: 'translate' | 'explain';
      /** Browser window the click came from; only that window's panel seeds the turn. */
      windowId?: number;
    }
  /** Background → tooltip, before the vision call starts, so the tab shows a loading state immediately. */
  | {
      kind: 'content:image-translate-pending';
      requestId: string;
      imageUrl: string;
      task?: 'translate' | 'explain';
    }
  /** Background → tooltip, with the full buffered result. Only when `Settings.imageTranslateSurface === 'tooltip'`. */
  | {
      kind: 'content:image-translate-result';
      requestId: string;
      translation: string;
      /** Absent when the provider sent none — never synthesized. */
      confidence?: number;
      explain?: string;
      detectedLang?: string;
      detectedDetail?: string;
      detectedLangs?: DetectedVariety[];
      usedImage?: boolean;
      imageUrl: string;
      /** Which vision arm ran, so Retry re-runs the same one. */
      task?: 'translate' | 'explain';
      error?: { code: ErrCode; message: string; retryAfterMs?: number };
    }
  /** Popup → content-script. Replies `{ text: string }`; an empty string means no selection. */
  | { kind: 'ega:get-selection' }
  /** Replies `{ context: PageContext | null }`. beforeText / afterText stay empty — the popup has no selection. */
  | { kind: 'ega:get-page-context'; level: 'minimal' | 'rich' }
  /** Side panel → background: turn a freeform refinement into a Rule. Replies `DescribeChangeResult`. */
  | {
      kind: 'template:describe-change';
      input: string;
      ctx: { task: Task | 'global' };
    }
  /** The options page holds its own port-manager copy, which always reports 'cold' — ask the SW instead. */
  | { kind: 'native:get-port-status' }
  /** "Test now" routes through the SW so the spawn lands in the port-manager copy the chip polls. */
  | {
      kind: 'native:test';
      cfg: BackendConfig;
      text: string;
      sourceLang: string;
      targetLang: string;
      timeoutMs?: number;
    }
  /** Flush the translation result cache so a template edit applies before the TTL expires. */
  | { kind: 'cache:clear' }
  /** Options page → SW. Replies `{ entries: PerfEntry[] }` — the buffer lives only in the SW instance. */
  | { kind: 'perf:entries' };

/** Reply shape for `native:test`. Returned via `sendResponse`. */
export interface NativeTestReply {
  ok: boolean;
  result?: string;
  /** Wall-clock from translate() entry to first delta. */
  firstDeltaMs?: number;
  /** Wall-clock from translate() entry to terminal frame (done/error). */
  totalMs?: number;
  error?: string;
}

export type DescribeChangeReply =
  { ok: true; response: DescribeChangeResponse } | { ok: false; reason: string };

/** What each kind's handler answers with. `void` means the listener returns false and nothing reads a reply. */
export interface MsgReply {
  'translate:start': { ok: true };
  'translate:chunk': void;
  'translate:cancel': { ok: true };
  'translate:cancel-all': { ok: true; count: number };
  'settings:update': PatchAck;
  'audit:push': { ok: true };
  'audit:clear': { ok: boolean };
  'audit:append': void;
  'backend:probe': { ok: true };
  'backend:probe-all': ProbeResult;
  'page:translateAll': { ok: true };
  'ctx:translate-selection': { ok: true };
  'hotkey:translate': { ok: true };
  'picker:enter': { ok: true };
  'ui:open-options': { ok: boolean };
  'ui:open-sidepanel': { ok: boolean };
  'image:translate': { ok: true };
  'sidepanel:seed-image-translate': void;
  'content:image-translate-pending': { ok: true };
  'content:image-translate-result': { ok: true };
  'ega:get-selection': { text: string };
  'ega:get-page-context': { context: PageContext | null };
  'template:describe-change': DescribeChangeReply;
  'native:get-port-status': { ok: true; status: PortStatus };
  'native:test': NativeTestReply;
  'cache:clear': { ok: true };
  'perf:entries': { entries: readonly PerfEntry[] };
}

// A kind missing from `MsgReply` makes this non-`never`, so the assignment below fails to compile.
type _ExhaustiveReplyCheck = Exclude<Msg['kind'], keyof MsgReply> extends never ? true : never;
const _exhaustiveReplies: _ExhaustiveReplyCheck = true;
void _exhaustiveReplies;

/** Typed request to the worker. Resolves `undefined` when nothing answers (worker asleep, no listener). */
export function sendMsg<K extends Msg['kind']>(
  msg: Extract<Msg, { kind: K }>,
): Promise<MsgReply[K] | undefined> {
  return chrome.runtime.sendMessage(msg) as Promise<MsgReply[K] | undefined>;
}

/** Typed request to a tab's content script. Rejects on a tab with no content script. */
export function sendTabMsg<K extends Msg['kind']>(
  tabId: number,
  msg: Extract<Msg, { kind: K }>,
): Promise<MsgReply[K] | undefined> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<MsgReply[K] | undefined>;
}

// `satisfies` alone passes on a subset, so the residual check below forces full coverage.
const ALL_KINDS = [
  'translate:start',
  'translate:chunk',
  'translate:cancel',
  'translate:cancel-all',
  'settings:update',
  'audit:push',
  'audit:clear',
  'audit:append',
  'backend:probe',
  'page:translateAll',
  'ctx:translate-selection',
  'hotkey:translate',
  'picker:enter',
  'ui:open-options',
  'ui:open-sidepanel',
  'image:translate',
  'sidepanel:seed-image-translate',
  'content:image-translate-pending',
  'content:image-translate-result',
  'ega:get-selection',
  'ega:get-page-context',
  'template:describe-change',
  'native:get-port-status',
  'native:test',
  'cache:clear',
  'perf:entries',
  'backend:probe-all',
] as const satisfies readonly Msg['kind'][];

// A kind missing from `ALL_KINDS` makes this non-`never`, so the assignment below fails to compile.
type _ExhaustiveKindsCheck =
  Exclude<Msg['kind'], (typeof ALL_KINDS)[number]> extends never ? true : never;
const _exhaustiveKinds: _ExhaustiveKindsCheck = true;
void _exhaustiveKinds;

const KNOWN_KINDS: ReadonlySet<Msg['kind']> = new Set(ALL_KINDS);

/** A `sender.tab` means another tab's content script, which could inject fake chunks or settings. */
export function isFromOwnBackground(sender: chrome.runtime.MessageSender | undefined): boolean {
  return sender?.id === chrome.runtime.id && sender.tab === undefined;
}

// Kind-only gate; payload fields are trusted. Safe while there is no `externally_connectable`.
export function hasKnownKind(x: unknown): x is Msg {
  if (typeof x !== 'object' || x === null || !('kind' in x)) return false;
  const k = (x as { kind: unknown }).kind;
  return typeof k === 'string' && KNOWN_KINDS.has(k as Msg['kind']);
}
