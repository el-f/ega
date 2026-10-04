import { describe, it, expect } from 'vitest';
import { createTranslateFsm } from '@/background/router-fsm';

describe('translate FSM', () => {
  it('initial state idle; acc empty; finalConfidence unset', () => {
    const fsm = createTranslateFsm();
    expect(fsm.state()).toBe('idle');
    expect(fsm.context().acc).toBe('');
    expect(fsm.context().finalConfidence).toBeUndefined();
    expect(fsm.context().firstDeltaAt).toBeUndefined();
    expect(fsm.context().finalDetectedLang).toBeUndefined();
    expect(fsm.context().finalDetectedDetail).toBeUndefined();
    expect(fsm.context().finalExplain).toBeUndefined();
    expect(fsm.context().finalError).toBeUndefined();
  });

  it('idle → start → attempting', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    expect(fsm.state()).toBe('attempting');
  });

  it('attempting → delta accumulates acc; state stays attempting', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({ type: 'delta', text: 'hel', now: 100 });
    fsm.send({ type: 'delta', text: 'lo', now: 110 });
    expect(fsm.state()).toBe('attempting');
    expect(fsm.context().acc).toBe('hello');
  });

  it('first delta sets firstDeltaAt; subsequent deltas keep original', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({ type: 'delta', text: 'a', now: 42 });
    fsm.send({ type: 'delta', text: 'b', now: 99 });
    fsm.send({ type: 'delta', text: 'c', now: 200 });
    expect(fsm.context().firstDeltaAt).toBe(42);
  });

  it('attempting → done assigns final fields; undefined chunk fields not set', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({ type: 'delta', text: 'x', now: 10 });
    fsm.send({
      type: 'done',
      chunk: {
        type: 'done',
        requestId: 'r',
        confidence: 0.87,
        detectedLang: 'es',
      },
    });
    expect(fsm.state()).toBe('completed');
    expect(fsm.context().finalConfidence).toBe(0.87);
    expect(fsm.context().finalDetectedLang).toBe('es');
    expect(fsm.context().finalDetectedDetail).toBeUndefined();
    expect(fsm.context().finalExplain).toBeUndefined();
  });

  it('done with all optional fields populates all', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({
      type: 'done',
      chunk: {
        type: 'done',
        requestId: 'r',
        confidence: 0.5,
        detectedLang: 'ar',
        detectedDetail: 'Levantine — Lebanese',
        explain: 'a brief gloss',
      },
    });
    expect(fsm.state()).toBe('completed');
    expect(fsm.context().finalDetectedLang).toBe('ar');
    expect(fsm.context().finalDetectedDetail).toBe('Levantine — Lebanese');
    expect(fsm.context().finalExplain).toBe('a brief gloss');
  });

  it('attempting → error → erroring; finalError populated', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({ type: 'error', code: 'NETWORK', message: 'boom' });
    expect(fsm.state()).toBe('erroring');
    expect(fsm.context().finalError).toEqual({ code: 'NETWORK', message: 'boom' });
  });

  it('completed terminal: subsequent events ignored', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({
      type: 'done',
      chunk: { type: 'done', requestId: 'r', confidence: 0.9 },
    });
    expect(fsm.state()).toBe('completed');
    fsm.send({ type: 'delta', text: 'late', now: 999 });
    fsm.send({ type: 'error', code: 'NETWORK', message: 'late' });
    expect(fsm.state()).toBe('completed');
    expect(fsm.context().acc).toBe('');
  });

  it('erroring does not accept done (no transition)', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'start' });
    fsm.send({ type: 'error', code: 'NETWORK', message: 'boom' });
    expect(fsm.state()).toBe('erroring');
    fsm.send({
      type: 'done',
      chunk: { type: 'done', requestId: 'r', confidence: 0.9 },
    });
    expect(fsm.state()).toBe('erroring');
    expect(fsm.context().finalConfidence).toBeUndefined();
  });

  it('idle does not accept delta / done / error before start', () => {
    const fsm = createTranslateFsm();
    fsm.send({ type: 'delta', text: 'early', now: 1 });
    fsm.send({ type: 'done', chunk: { type: 'done', requestId: 'r', confidence: 1 } });
    fsm.send({ type: 'error', code: 'NETWORK', message: 'x' });
    expect(fsm.state()).toBe('idle');
    expect(fsm.context().acc).toBe('');
  });
});
