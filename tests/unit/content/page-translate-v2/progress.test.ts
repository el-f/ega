import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  pillPhase,
  pillStatus,
  settleAnnouncement,
  type PageProgress,
} from '@/content/page-translate-v2/progress';

const base: PageProgress = {
  done: 0,
  failed: 0,
  total: 10,
  waiting: 0,
  inFlight: 0,
  queued: 0,
  skipped: 0,
  settled: false,
};
const NOW = 1_000_000;

describe('pillPhase', () => {
  it.each<[Partial<PageProgress>, ReturnType<typeof pillPhase>]>([
    [{ inFlight: 3 }, 'running'],
    [{ queued: 2 }, 'running'],
    [{ waiting: 8, done: 2 }, 'idle'],
    [{ waiting: 8, inFlight: 1 }, 'running'],
    [{ inFlight: 1, pausedUntil: NOW + 5000 }, 'paused'],
    [{ inFlight: 1, pausedUntil: NOW - 1 }, 'running'],
    [{ settled: true, done: 10 }, 'settled'],
    [{ settled: true, done: 10, pausedUntil: NOW + 5000 }, 'settled'],
  ])('%o is %s', (over, phase) => {
    expect(pillPhase({ ...base, ...over }, NOW)).toBe(phase);
  });
});

describe('pillStatus', () => {
  it.each<[Partial<PageProgress>, string]>([
    [{ done: 4, inFlight: 3, waiting: 0 }, 'Translating 4 of 10 areas…'],
    [{ done: 1, inFlight: 1, total: 48, waiting: 38 }, 'Translating 1 of 10 areas…'],
    [
      { done: 10, total: 48, waiting: 38 },
      '10 of 48 areas translated. The rest translate as you scroll.',
    ],
    [
      { done: 6, failed: 1, total: 48, waiting: 38 },
      '5 of 48 areas translated. The rest translate as you scroll.',
    ],
    [
      { inFlight: 1, pausedUntil: NOW + 11_200, pausedBy: 'Anthropic' },
      'Paused: Anthropic is limiting requests. Resuming in 12 s.',
    ],
    [
      {
        settled: true,
        done: 3,
        total: 3,
        failed: 3,
        skipped: 9,
        failure: {
          body: 'Anthropic did not accept the saved API key.',
          actions: ['open-settings'],
          tab: 'backends',
          details: [],
        },
      },
      "Couldn't translate the page. Anthropic did not accept the saved API key.",
    ],
    [{ settled: true, done: 10, target: 'English' }, 'Page translated to English'],
    [{ settled: true, done: 5, total: 5, skipped: 7 }, 'Stopped. Translated 5 of 12 areas.'],
    [
      { settled: true, done: 5, total: 5, skipped: 7, partialSelection: true },
      'Translated 5 of 12 areas.',
    ],
    [
      {
        settled: true,
        done: 12,
        total: 12,
        failed: 2,
        failure: {
          body: 'Anthropic took too long to answer.',
          actions: [],
          tab: 'backends',
          details: [],
        },
      },
      "Couldn't translate 2 of 12 areas. Anthropic took too long to answer.",
    ],
    [
      {
        settled: true,
        done: 12,
        total: 12,
        failed: 12,
        failure: {
          body: 'Anthropic did not accept the saved API key.',
          actions: ['open-settings'],
          tab: 'backends',
          details: [],
        },
      },
      "Couldn't translate the page. Anthropic did not accept the saved API key.",
    ],
  ])('%o reads %s', (over, text) => {
    expect(pillStatus({ ...base, ...over }, NOW)).toBe(text);
  });

  it('never claims the page is translated while anything failed or was stopped', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        fc.nat({ max: 20 }),
        fc.nat({ max: 20 }),
        (done, failed, skipped) => {
          const p = {
            ...base,
            settled: true,
            done: done + failed,
            failed,
            total: done + failed,
            skipped,
          };
          const text = pillStatus(p, NOW);
          if (failed > 0 || skipped > 0) expect(text).not.toMatch(/^Page translated/);
          else expect(text).toMatch(/^Page translated/);
        },
      ),
    );
  });
});

describe('settleAnnouncement', () => {
  it('says it once, plainly', () => {
    expect(settleAnnouncement({ ...base, settled: true, done: 10 })).toBe('Page translated.');
    expect(
      settleAnnouncement({
        ...base,
        settled: true,
        done: 5,
        total: 5,
        skipped: 7,
        partialSelection: true,
      }),
    ).toBe('Translated 5 of 12.');
    expect(settleAnnouncement({ ...base, settled: true, done: 5, total: 5, skipped: 7 })).toBe(
      'Stopped. Translated 5 of 12.',
    );
    expect(settleAnnouncement({ ...base, settled: true, done: 12, total: 12, failed: 2 })).toBe(
      "Couldn't translate 2 of 12 areas.",
    );
  });
});
