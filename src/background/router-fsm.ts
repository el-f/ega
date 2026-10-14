import type {
  AnswerSnapshot,
  DetectedVariety,
  ResultMeta,
  TokenUsage,
  TranslationChunk,
} from '@/shared/types';
import type { AnswerNote, AnswerDetail } from '@/shared/answer/reader';

type TranslateState = 'idle' | 'attempting' | 'completed' | 'erroring';

type TranslateEvent =
  | { type: 'start' }
  | { type: 'delta'; text: string; now: number; replace?: true }
  | { type: 'done'; chunk: Extract<TranslationChunk, { type: 'done' }> }
  | { type: 'error'; code: string; message: string };

interface TranslateCtx {
  acc: string;
  finalText: string | undefined;
  finalAnswer: AnswerSnapshot | undefined;
  finalNotes: AnswerNote[] | undefined;
  finalDetails: AnswerDetail[] | undefined;
  finalAnswerFormat: ResultMeta['answerFormat'];
  finalConfidence: number | undefined;
  finalDetectedLang: string | undefined;
  finalDetectedDetail: string | undefined;
  finalDetectedLangs: DetectedVariety[] | undefined;
  finalExplain: string | undefined;
  finalError: { code: string; message: string } | undefined;
  finalUsage: TokenUsage | undefined;
  firstDeltaAt: number | undefined;
}

/** Translate lifecycle: idle → attempting → completed | erroring. Events the current state does not accept are ignored. */
export function createTranslateFsm() {
  let state: TranslateState = 'idle';
  const ctx: TranslateCtx = {
    acc: '',
    finalText: undefined,
    finalAnswer: undefined,
    finalNotes: undefined,
    finalDetails: undefined,
    finalAnswerFormat: undefined,
    finalConfidence: undefined,
    finalDetectedLang: undefined,
    finalDetectedDetail: undefined,
    finalDetectedLangs: undefined,
    finalExplain: undefined,
    finalError: undefined,
    finalUsage: undefined,
    firstDeltaAt: undefined,
  };

  function send(event: TranslateEvent): void {
    if (state === 'idle') {
      if (event.type === 'start') state = 'attempting';
      return;
    }
    if (state !== 'attempting') return;
    if (event.type === 'delta') {
      ctx.acc = event.replace ? event.text : ctx.acc + event.text;
      ctx.firstDeltaAt ??= event.now;
    } else if (event.type === 'done') {
      const c = event.chunk;
      ctx.finalText = c.text;
      ctx.finalAnswer = c.answer;
      ctx.finalNotes = c.notes;
      ctx.finalDetails = c.details;
      ctx.finalAnswerFormat = c.meta?.answerFormat;
      ctx.finalConfidence = c.confidence;
      if (c.detectedLang !== undefined) ctx.finalDetectedLang = c.detectedLang;
      if (c.detectedDetail !== undefined) ctx.finalDetectedDetail = c.detectedDetail;
      if (c.detectedLangs !== undefined) ctx.finalDetectedLangs = c.detectedLangs;
      if (c.explain !== undefined) ctx.finalExplain = c.explain;
      if (c.usage !== undefined) ctx.finalUsage = c.usage;
      state = 'completed';
    } else if (event.type === 'error') {
      ctx.finalError = { code: event.code, message: event.message };
      state = 'erroring';
    }
  }

  return { state: () => state, context: () => ctx, send };
}
