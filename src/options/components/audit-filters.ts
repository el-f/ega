// Kept out of the Svelte module script so plain tsc can resolve it for `.ts` tests.
import type { AuditTask } from '@/shared/audit-log';

export type AuditFilterStatus = 'all' | 'ok' | 'error' | 'cache';

export interface AuditFilters {
  task: 'all' | AuditTask;
  backend: string;
  status: AuditFilterStatus;
  query: string;
}

export const EMPTY_FILTERS: AuditFilters = {
  task: 'all',
  backend: 'all',
  status: 'all',
  query: '',
};

export function hasActiveFilters(f: AuditFilters): boolean {
  return f.task !== 'all' || f.backend !== 'all' || f.status !== 'all' || f.query.trim() !== '';
}

export function countActiveFilters(f: AuditFilters): number {
  let n = 0;
  if (f.task !== 'all') n++;
  if (f.backend !== 'all') n++;
  if (f.status !== 'all') n++;
  if (f.query.trim() !== '') n++;
  return n;
}
