import type { DetectedVariety, TranslationChunk } from '@/shared/types';

type TranslateState = 'idle' | 'attempting' | 'completed' | 'erroring';

type TranslateEvent =
  | { type: 'start' }
  | { type: 'delta'; text: string; now: number }
  | { type: 'done'; chunk: Extract<TranslationChunk, { type: 'done' }> }
  | { type: 'error'; code: string; message: string };

interface TranslateCtx {
  acc: string;
  finalConfidence: number | undefined;
  finalDetectedLang: string | undefined;
  finalDetectedDetail: string | undefined;
  finalDetectedLangs: DetectedVariety[] | undefined;
  finalExplain: string | undefined;
  finalError: { code: string; message: string } | undefined;
  firstDeltaAt: number | undefined;
}

/** Translate lifecycle: idle → attempting → completed | erroring. Events the current state does not accept are ignored. */
export function createTranslateFsm() {
  let state: TranslateState = 'idle';
  const ctx: TranslateCtx = {
    acc: '',
    finalConfidence: undefined,
    finalDetectedLang: undefined,
    finalDetectedDetail: undefined,
    finalDetectedLangs: undefined,
    finalExplain: undefined,
    finalError: undefined,
    firstDeltaAt: undefined,
  };

  function send(event: TranslateEvent): void {
    if (state === 'idle') {
      if (event.type === 'start') state = 'attempting';
      return;
    }
    if (state !== 'attempting') return;
    if (event.type === 'delta') {
      ctx.acc += event.text;
      ctx.firstDeltaAt ??= event.now;
    } else if (event.type === 'done') {
      const c = event.chunk;
      ctx.finalConfidence = c.confidence;
      if (c.detectedLang !== undefined) ctx.finalDetectedLang = c.detectedLang;
      if (c.detectedDetail !== undefined) ctx.finalDetectedDetail = c.detectedDetail;
      if (c.detectedLangs !== undefined) ctx.finalDetectedLangs = c.detectedLangs;
      if (c.explain !== undefined) ctx.finalExplain = c.explain;
      state = 'completed';
    } else if (event.type === 'error') {
      ctx.finalError = { code: event.code, message: event.message };
      state = 'erroring';
    }
  }

  return { state: () => state, context: () => ctx, send };
}
