import type {
  CustomLanguage,
  DetectedVariety,
  ErrCode,
  Settings,
  LangSelection,
  PageContext,
  TranslationChunk,
  AnswerSnapshot,
  ResultMeta,
} from './types';
import type { AnswerNote, AnswerDetail } from './answer/reader';
import type { Tone } from './task-prompts';
import type { MenuSurface } from './context-menu';
import type { CustomTask } from './settings-schema';
import type { TaskId } from './task-view';
import type { AuditEntry, AuditSurface } from './audit-log';
import type { BackendConfig } from './backends/base';
import type { ChatTurn } from './chat-history';
import type { SettingsTab } from './settings-tabs';
import type { PatchAck } from './settings-bus';
import type { PortStatus } from './cli-session/port-manager';
import type { PerfEntry } from './perf-history';
import type { ProbeResult } from './translate-ui';
import type { PendingPopupHandoff } from './pending-popup-handoff';
import type { CustomTaskInput } from './tasks';

/** Why the selection bubble stayed hidden for the last selection; the popup names it. */
export type HeldBackReason = 'english' | 'too-short' | 'mode-never';
export interface HeldBack {
  reason: HeldBackReason;
  /** too-short only: the length the selection fell under. */
  minLength?: number;
}

export type Msg =
  | {
      kind: 'task:try';
      requestId: string;
      draft: CustomTaskInput;
      text: string;
      sourceLang: LangSelection;
      targetLang: LangSelection;
    }
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
        task?: TaskId;
        /** Fills the {{tone}} slot in any task prompt that uses it. */
        tone?: Tone;
        /** Instruction injected into the system prompt for this request only. Never persisted. */
        refinement?: string;
        /** Vision-explain image (see TranslationRequest.options.imageUrl). */
        imageUrl?: string;
        /** Prior conversation turns, oldest-first. Absent on the first turn. */
        conversationHistory?: ChatTurn[];
        /** One block of a page translate (see TranslationRequest.options.batch). */
        batch?: boolean;
        /** Skip the cached answer (see TranslationRequest.options.freshAnswer). */
        freshAnswer?: boolean;
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
  /** Extension page → SW: delete these side panel conversations after their Undo window. Content scripts are refused. */
  | { kind: 'conversations:delete'; ids: string[] | 'all' }
  /** Audit log → sidepanel toaster. Emitted only for entries carrying an `error`. */
  | {
      kind: 'audit:append';
      entry: {
        error?: { code: string; message: string };
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
  /** Popup → content: open area picking (Choose areas). */
  | { kind: 'page:chooseAreas' }
  /** Popup or content → SW: set (never toggle) Ega on or off for a site. A content script's own URL wins over `url`. */
  | { kind: 'site:set-enabled'; enabled: boolean; url?: string }
  | { kind: 'ctx:translate-selection'; text?: string; task?: TaskId; targetLang?: LangSelection }
  | { kind: 'hotkey:translate' }
  | { kind: 'picker:enter' }
  /** A content script has no `chrome.runtime.openOptionsPage`, so the tab to land on rides the message. */
  | { kind: 'ui:open-options'; tab?: SettingsTab }
  | {
      kind: 'ui:open-sidepanel';
      /** The SW writes this to the handoff slot, so a content script needs no storage.session access. */
      handoff?: PendingPopupHandoff;
    }
  /** Sent by the image tooltip's Retry and by the e2e hook; the context menu calls dispatchImageTranslate directly.
   *  The Retry sends 'tooltip', the surface of the answer it retries; omitted, the stored global decides. */
  | {
      kind: 'image:translate';
      requestId: string;
      imageUrl: string;
      task?: TaskId;
      surface?: MenuSurface;
    }
  /** Sent before a context-menu image translate: without a seeded turn the arriving chunks match nothing and vanish. */
  | {
      kind: 'sidepanel:seed-image-translate';
      requestId: string;
      imageUrl: string;
      task?: TaskId;
      /** Browser window the click came from; only that window's panel seeds the turn. */
      windowId?: number;
    }
  /** Background → tooltip, before the vision call starts, so the tab shows a loading state immediately. */
  | {
      kind: 'content:image-translate-pending';
      requestId: string;
      imageUrl: string;
      task?: TaskId;
    }
  /** Background → tooltip, with the full buffered result. Only for a request on the tooltip surface. */
  | {
      kind: 'content:image-translate-result';
      requestId: string;
      translation: string;
      /** Absent when the provider sent none — never synthesized. */
      confidence?: number;
      explain?: string;
      notes?: AnswerNote[];
      details?: AnswerDetail[];
      answer?: AnswerSnapshot;
      meta?: ResultMeta;
      detectedLang?: string;
      detectedDetail?: string;
      detectedLangs?: DetectedVariety[];
      usedImage?: boolean;
      imageUrl: string;
      /** Which vision arm ran, so Retry re-runs the same one. */
      task?: TaskId;
      error?: { code: ErrCode; message: string; retryAfterMs?: number };
    }
  /** Background → every tab: these mirrored storage keys changed; the content script re-reads them. */
  | { kind: 'content:storage-changed'; keys: string[] }
  /** Content script → SW: the parsed settings with no API keys, so the page never loads the storage reader. */
  | { kind: 'content:read-settings' }
  | { kind: 'content:read-languages' }
  | { kind: 'content:read-tasks' }
  /** Popup → content-script. Replies `{ text, heldBack? }`; an empty string means no selection. */
  | { kind: 'ega:get-selection' }
  /** Replies `{ context: PageContext | null }`. beforeText / afterText stay empty — the popup has no selection. */
  | { kind: 'ega:get-page-context'; level: 'minimal' | 'rich' }
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
  /** Set when the backend reported a typed error, so the audit log keeps the real code. */
  code?: ErrCode;
}

/** What each kind's handler answers with. `void` means the listener returns false and nothing reads a reply. */
export interface MsgReply {
  'task:try': Extract<TranslationChunk, { type: 'done' | 'error' }>;
  'translate:start': { ok: true };
  'translate:chunk': void;
  'translate:cancel': { ok: true };
  'translate:cancel-all': { ok: true };
  'settings:update': PatchAck;
  'audit:push': { ok: true };
  'audit:clear': { ok: boolean };
  'conversations:delete': { ok: boolean };
  'audit:append': void;
  'backend:probe': { ok: true };
  'backend:probe-all': ProbeResult;
  'page:translateAll': { ok: true };
  'page:chooseAreas': { ok: true };
  'site:set-enabled': { ok: boolean };
  'ctx:translate-selection': { ok: true };
  'hotkey:translate': { ok: true };
  'picker:enter': { ok: true };
  'ui:open-options': { ok: boolean };
  /** `imageLeftBehind`: the worker opened the panel without the attach image (unsafe, or over the reader's cap). */
  'ui:open-sidepanel': { ok: boolean; imageLeftBehind?: true };
  'image:translate': { ok: true };
  'sidepanel:seed-image-translate': void;
  'content:image-translate-pending': { ok: true };
  'content:image-translate-result': { ok: true };
  'content:storage-changed': void;
  'content:read-settings': Settings;
  'content:read-languages': CustomLanguage[];
  'content:read-tasks': CustomTask[];
  'ega:get-selection': { text: string; heldBack?: HeldBack };
  'ega:get-page-context': { context: PageContext | null };
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
  'task:try',
  'translate:start',
  'translate:chunk',
  'translate:cancel',
  'translate:cancel-all',
  'settings:update',
  'audit:push',
  'audit:clear',
  'conversations:delete',
  'audit:append',
  'backend:probe',
  'page:translateAll',
  'page:chooseAreas',
  'site:set-enabled',
  'ctx:translate-selection',
  'hotkey:translate',
  'picker:enter',
  'ui:open-options',
  'ui:open-sidepanel',
  'image:translate',
  'sidepanel:seed-image-translate',
  'content:image-translate-pending',
  'content:image-translate-result',
  'content:storage-changed',
  'content:read-settings',
  'content:read-languages',
  'content:read-tasks',
  'ega:get-selection',
  'ega:get-page-context',
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
