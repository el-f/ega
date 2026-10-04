import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  countActiveFilters,
  type AuditFilters,
} from '@/options/components/audit-filters';

describe('audit-filters', () => {
  it('EMPTY_FILTERS is inactive', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('non-all task → active', () => {
    const f: AuditFilters = { ...EMPTY_FILTERS, task: 'translate' };
    expect(hasActiveFilters(f)).toBe(true);
  });

  it('non-all backend → active', () => {
    const f: AuditFilters = { ...EMPTY_FILTERS, backend: 'anthropic' };
    expect(hasActiveFilters(f)).toBe(true);
  });

  it('non-all status → active', () => {
    const f: AuditFilters = { ...EMPTY_FILTERS, status: 'error' };
    expect(hasActiveFilters(f)).toBe(true);
  });

  it('non-empty query → active (after trim)', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'hi' })).toBe(true);
    // Whitespace-only doesn't count.
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '   ' })).toBe(false);
  });

  it('multiple non-defaults all flag active', () => {
    const f: AuditFilters = { task: 'reword', backend: 'anthropic', status: 'cache', query: 'x' };
    expect(hasActiveFilters(f)).toBe(true);
  });

  it('countActiveFilters returns 0 on EMPTY_FILTERS', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('countActiveFilters counts each non-default field', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, task: 'reword' })).toBe(1);
    expect(countActiveFilters({ ...EMPTY_FILTERS, task: 'reword', backend: 'anthropic' })).toBe(2);
    const all: AuditFilters = { task: 'reword', backend: 'anthropic', status: 'error', query: 'x' };
    expect(countActiveFilters(all)).toBe(4);
  });

  it('countActiveFilters ignores whitespace-only query', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, query: '   ' })).toBe(0);
  });
});
