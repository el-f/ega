import { describe, it, expect } from 'vitest';
import {
  SEPARATOR_GAP_MS,
  conversationTitle,
  listTime,
  modeChipLabel,
  separatorLabel,
  separatorTurnIds,
  swapResult,
  taskLabelsOnChange,
} from '@/sidepanel/state/thread-view';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import type { Turn } from '@/sidepanel/state/conversation';

const at = (y: number, mo: number, d: number, h = 12, mi = 0): number =>
  new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 6, 14, 30);

function user(id: string, createdAt: number, over: Partial<Turn> = {}): Turn {
  return {
    id,
    role: 'user',
    kind: 'translate',
    status: 'idle',
    createdAt,
    content: id,
    ...over,
  } as Turn;
}

describe('conversationTitle', () => {
  it('uses the first message, then Image, then New conversation', () => {
    expect(conversationTitle({ title: 'hola' })).toBe('hola');
    expect(conversationTitle({ imageFirst: true })).toBe('Image');
    expect(conversationTitle({})).toBe('New conversation');
  });
});

describe('listTime', () => {
  it('reads like a person would say it', () => {
    expect(listTime(NOW - 10_000, NOW)).toBe('just now');
    expect(listTime(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(listTime(at(2026, 10, 6, 9), NOW)).toBe('5 h ago');
    expect(listTime(at(2026, 10, 5, 23), NOW)).toBe('Yesterday');
    expect(listTime(at(2026, 10, 3), NOW)).toBe('3 days ago');
    expect(listTime(at(2026, 9, 1), NOW, 'en-US')).toBe('Sep 1');
  });
});

describe('separatorLabel', () => {
  it('names today and yesterday, the weekday this year, and the year before that', () => {
    expect(separatorLabel(at(2026, 10, 6, 14, 2), NOW, 'en-GB')).toBe('Today 14:02');
    expect(separatorLabel(at(2026, 10, 5, 9, 15), NOW, 'en-GB')).toBe('Yesterday 09:15');
    expect(separatorLabel(at(2026, 10, 3, 14, 2), NOW, 'en-US')).toMatch(/^Sat, Oct 3 · 2:02 PM$/);
    expect(separatorLabel(at(2025, 10, 5, 14, 2), NOW, 'en-US')).toMatch(/^Oct 5, 2025 · 2:02 PM$/);
  });
});

describe('separatorTurnIds', () => {
  it('marks the first turn and any that came 30+ minutes after the one before', () => {
    const t0 = at(2026, 10, 6, 10);
    const turns = [
      user('a', t0),
      user('b', t0 + 60_000),
      user('c', t0 + 60_000 + SEPARATOR_GAP_MS - 1),
      user('d', t0 + 60_000 + 2 * SEPARATOR_GAP_MS),
    ];
    expect([...separatorTurnIds(turns)]).toEqual(['a', 'd']);
  });
});

describe('taskLabelsOnChange', () => {
  it('shows a task only where it changes, or on a first message that is not Translate', () => {
    const turns = [
      user('u1', 1),
      user('u2', 2, { kind: 'explain' }),
      user('u3', 3, { kind: 'explain' }),
      user('u4', 4, { kind: 'reword', tone: 'casual' }),
      user('u5', 5, { kind: 'reword', tone: 'neutral' }),
    ];
    expect(Object.fromEntries(taskLabelsOnChange(turns, SHIPPED_TASK_VIEWS))).toEqual({
      u2: 'Explain',
      u4: 'Reword · Casual',
      u5: 'Reword',
    });
    expect(
      taskLabelsOnChange([user('x', 1, { kind: 'summarize' })], SHIPPED_TASK_VIEWS).get('x'),
    ).toBe('Summarize');
  });
});

describe('modeChipLabel', () => {
  const base = {
    taskLabel: 'Translate',
    answersInTarget: true,
    source: undefined,
    target: 'English',
  };
  it('follows the label rules', () => {
    expect(modeChipLabel(base)).toBe('Translate → English');
    expect(modeChipLabel({ ...base, source: 'Spanish' })).toBe('Translate · Spanish → English');
    expect(
      modeChipLabel({ ...base, taskLabel: 'Reword', answersInTarget: false, tone: 'casual' }),
    ).toBe('Reword · Casual');
    expect(modeChipLabel({ ...base, taskLabel: 'Grammar', answersInTarget: false })).toBe(
      'Grammar',
    );
    expect(modeChipLabel({ ...base, taskLabel: 'Summarize', imageToTranslate: true })).toBe(
      'Translate image → English',
    );
  });
});

describe('swapResult', () => {
  it('trades a real pair, uses the detected language for Auto-detect, and gives up otherwise', () => {
    expect(swapResult('es', 'en', undefined)).toEqual({ source: 'en', target: 'es' });
    expect(swapResult('auto', 'en', 'es')).toEqual({ source: 'en', target: 'es' });
    expect(swapResult('auto', 'en', undefined)).toBeNull();
    expect(swapResult('auto', 'en', 'en')).toBeNull();
    expect(swapResult('en', 'en', undefined)).toBeNull();
  });
});
