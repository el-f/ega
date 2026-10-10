import type { Msg } from '@/shared/messages';
import type { LangSelection, TranslationChunk } from '@/shared/types';
import type { Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import { createLogger } from '@/shared/logger';

const log = createLogger('cs.request');

export interface PendingReq {
  id: string;
  text: string;
  rect: DOMRect;
  sourceLang: LangSelection;
  targetLang?: LangSelection;
  direction: { source: LangSelection; target: LangSelection };
  /** What was asked for before detection resolved `auto`; the per-site memo stores this, never the detected variety. */
  requestedDirection?: { source: LangSelection; target: LangSelection };
  range?: Range;
  context?: NonNullable<Extract<Msg, { kind: 'translate:start' }>['context']>;
  task?: TaskId;
  tone?: Tone;
  /** Vision-explain image attached to an explain request. */
  imageUrl?: string;
  /** The request ran as an explain; Retry keeps it that way. */
  explain?: boolean;
  /** Per-request change from the tooltip Refine menu. */
  refinement?: string;
  /** Regenerate bypasses the cached answer once, without changing the request's identity. */
  freshAnswer?: boolean;
}

export type RendererOwner = 'tooltip' | 'inline' | 'page-v2';
export type DoneMeta = Omit<Extract<TranslationChunk, { type: 'done' }>, 'type' | 'requestId'>;
export type ErrMeta = Omit<Extract<TranslationChunk, { type: 'error' }>, 'type' | 'requestId'>;

/** One surface a request streams into. `dispose` tears the surface down after the rows are gone. */
export interface Renderer {
  append(requestId: string, text: string, replace?: true): void;
  finish(requestId: string, meta: DoneMeta): void;
  error(requestId: string, err: ErrMeta): void;
  dispose?(requestId: string): void;
}

export type EndReason =
  'close' | 'cancel' | 'nav' | 'reopen' | 'superseded' | 'esc' | 'page-teardown';

export const pending = new Map<string, PendingReq>();
export const rendererOwner = new Map<string, RendererOwner>();
export const perfTimers = new Map<string, { startedAt: number; firstDelta: number | null }>();
/** Requests whose worker stream is still open: a cancel is owed only to these. */
const streaming = new Set<string>();
const renderers = new Map<RendererOwner, Renderer>();

let stopStream: ((requestId: string) => void) | null = null;

/** The entry point owns the runtime channel; renderer modules reach it through here. */
export function setStopStreamHook(fn: ((requestId: string) => void) | null): void {
  stopStream = fn;
}

export function setRenderer(owner: RendererOwner, renderer: Renderer): void {
  renderers.set(owner, renderer);
}

/** A chunk for an id nobody registered goes to the tooltip, which drops it when no entry matches. */
export function rendererFor(requestId: string): Renderer | undefined {
  return renderers.get(rendererOwner.get(requestId) ?? 'tooltip');
}

export function beginRequest(requestId: string, owner: RendererOwner): void {
  rendererOwner.set(requestId, owner);
  streaming.add(requestId);
}

/** A terminal chunk landed: the worker closed the stream itself, so no cancel is owed. */
export function settleStream(requestId: string): void {
  streaming.delete(requestId);
}

/** Stops the worker's stream without touching the rows, so Retry still has its `pending` row. */
export function stopRequestStream(requestId: string): void {
  streaming.delete(requestId);
  stopStream?.(requestId);
}

/** Drops the rows and leaves the surface alone: a settled inline span stays on the page. */
export function releaseRequest(requestId: string): void {
  streaming.delete(requestId);
  pending.delete(requestId);
  perfTimers.delete(requestId);
  rendererOwner.delete(requestId);
}

/** The one exit for a request: one cancel if the stream is still open, then the rows, then the surface. */
export function endRequest(requestId: string, reason: EndReason): void {
  log.debug('end', reason, requestId);
  if (streaming.delete(requestId)) stopStream?.(requestId);
  const owner = rendererOwner.get(requestId);
  releaseRequest(requestId);
  if (owner) renderers.get(owner)?.dispose?.(requestId);
}
