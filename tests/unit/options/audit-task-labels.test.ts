import { describe, it, expect } from 'vitest';
import { auditTaskIds, auditTaskLabel } from '@/options/components/audit-filters';
import { materializeTasks } from '@/shared/task-view';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

const views = materializeTasks({ ...DEFAULT_SETTINGS } as Settings, [
  {
    id: 'c-tweet',
    label: 'Tweet summary',
    system: '',
    user: '{{text}}',
    output: 'plain',
    pageContext: false,
    image: false,
    glossary: false,
    createdAt: 1,
  },
]);

describe('audit task names', () => {
  it('names built-ins, audit-only ids, custom tasks, and a gone task', () => {
    expect(auditTaskLabel('summarize', views)).toBe('Summarize');
    expect(auditTaskLabel('backend-test', views)).toBe('Backend test');
    expect(auditTaskLabel('c-tweet', views)).toBe('Tweet summary');
    expect(auditTaskLabel('c-gone', views)).toBe('Deleted task');
  });

  it('the filter offers every task, the live audit-only ids, and ids only an entry still carries', () => {
    const ids = auditTaskIds(views, ['c-gone', 'translate']);
    expect(ids).toContain('c-tweet');
    expect(ids).toContain('backend-test');
    expect(ids).not.toContain('describe-change');
    expect(auditTaskIds(views, ['describe-change'])).toContain('describe-change');
    expect(ids).toContain('c-gone');
    expect(ids.filter((i) => i === 'translate')).toHaveLength(1);
  });
});
