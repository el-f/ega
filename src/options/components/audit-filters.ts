// Kept out of the Svelte module script so plain tsc can resolve it for `.ts` tests.
import { AUDIT_ONLY_TASK_LABELS, LIVE_AUDIT_ONLY_TASKS, type AuditEntry } from '@/shared/audit-log';
import { taskLabel, type TaskView } from '@/shared/task-view';
import { backendLabel } from '@/shared/backends/provider-profiles';
import { errorCopy } from '@/shared/error-copy';

export type AuditFilterStatus = 'all' | 'ok' | 'error' | 'cache';

export interface AuditFilters {
  task: string;
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

/** The name an audit row shows for its task: audit-only ids first, then tasks, then "Deleted task". */
export function auditTaskLabel(id: string, views: readonly TaskView[]): string {
  return Object.hasOwn(AUDIT_ONLY_TASK_LABELS, id)
    ? AUDIT_ONLY_TASK_LABELS[id as keyof typeof AUDIT_ONLY_TASK_LABELS]
    : taskLabel(views, id);
}

/** "Ega" for a row no backend answered (a cache hit, or no backend was ready); else the backend's name. */
export function auditBackendLabel(id: string): string {
  return id === 'auto' || id === 'unknown' ? 'Ega' : backendLabel(id);
}

/** A row's status in words: OK, From cache, Canceled, or the shared error title. */
export function auditStatusLabel(e: Pick<AuditEntry, 'error' | 'cacheHit' | 'backend'>): string {
  if (e.error === undefined) return e.cacheHit ? 'From cache' : 'OK';
  const copy = errorCopy(e.error.code, e.error.message, { backend: auditBackendLabel(e.backend) });
  return copy?.title ?? 'Canceled';
}

/** Every task a filter can pick: today's tasks, the live audit-only ids, and any id an entry still carries. */
export function auditTaskIds(views: readonly TaskView[], seen: readonly string[]): string[] {
  return [...new Set([...views.map((v) => v.id), ...LIVE_AUDIT_ONLY_TASKS, ...seen])];
}

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

type TokenFields = Pick<AuditEntry, 'inputTokens' | 'outputTokens'>;

/** The stored row is not validated past its required fields, so a count is read only when it is one. */
function tokenCount(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** "1,200 in · 30 out" for a row that reports tokens; null for one that does not. */
export function tokenPairLabel(e: TokenFields): string | null {
  const input = tokenCount(e.inputTokens);
  const output = tokenCount(e.outputTokens);
  const parts = [
    ...(input !== undefined ? [`${input.toLocaleString('en-US')} in`] : []),
    ...(output !== undefined ? [`${output.toLocaleString('en-US')} out`] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The same label summed over every kept row; a side no row reported stays out, not a 0. */
export function tokenTotalLabel(entries: readonly TokenFields[]): string | null {
  const sum = (key: keyof TokenFields): TokenFields => {
    const counts = entries.flatMap((e) => tokenCount(e[key]) ?? []);
    return counts.length > 0 ? { [key]: counts.reduce((a, b) => a + b, 0) } : {};
  };
  return tokenPairLabel({ ...sum('inputTokens'), ...sum('outputTokens') });
}
