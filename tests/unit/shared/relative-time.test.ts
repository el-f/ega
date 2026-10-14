import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/shared/relative-time';

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

describe('relativeTime', () => {
  it('returns empty string for undefined ts', () => {
    expect(relativeTime(undefined, NOW)).toBe('');
  });

  it('returns "just now" for < 10s ago', () => {
    expect(relativeTime(NOW, NOW)).toBe('just now');
    expect(relativeTime(NOW - 9_000, NOW)).toBe('just now');
  });

  it('returns "Ns ago" for 10s–59s', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe('30s ago');
    expect(relativeTime(NOW - 59_000, NOW)).toBe('59s ago');
    expect(relativeTime(NOW - 10_000, NOW)).toBe('10s ago');
  });

  it('returns "Nm ago" for 1m–59m', () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(relativeTime(NOW - 59 * 60_000, NOW)).toBe('59m ago');
    expect(relativeTime(NOW - 60_000, NOW)).toBe('1m ago');
  });

  it('returns "Nh ago" for 1h–23h', () => {
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3h ago');
    expect(relativeTime(NOW - 23 * 3_600_000, NOW)).toBe('23h ago');
  });

  it('returns "Nd ago" from 24h up to 30 days', () => {
    expect(relativeTime(NOW - DAY, NOW)).toBe('1d ago');
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe('2d ago');
    expect(relativeTime(NOW - 29 * DAY, NOW)).toBe('29d ago');
  });

  it('returns "Nmo ago" from 30 days up to a year', () => {
    expect(relativeTime(NOW - 30 * DAY, NOW)).toBe('1mo ago');
    expect(relativeTime(NOW - 200 * DAY, NOW)).toBe('6mo ago');
    expect(relativeTime(NOW - 359 * DAY, NOW)).toBe('11mo ago');
  });

  it('returns "Ny ago" past a year', () => {
    expect(relativeTime(NOW - 360 * DAY, NOW)).toBe('1y ago');
    expect(relativeTime(NOW - 800 * DAY, NOW)).toBe('2y ago');
  });

  it('clamps a future timestamp to "just now"', () => {
    expect(relativeTime(NOW + 60_000, NOW)).toBe('just now');
  });
});
