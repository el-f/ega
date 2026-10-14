import { describe, it, expect } from 'vitest';
import { auditSurfaceLabel } from '@/sidepanel/audit-surface-label';

describe('auditSurfaceLabel', () => {
  it('names the three surfaces a panel user cannot see', () => {
    expect(auditSurfaceLabel('content')).toBe('On the page');
    expect(auditSurfaceLabel('popup')).toBe('In the popup');
    expect(auditSurfaceLabel('options')).toBe('In settings');
  });

  it('says nothing for its own surface, an unknown one, or none', () => {
    expect(auditSurfaceLabel('sidepanel')).toBeNull();
    expect(auditSurfaceLabel('unknown')).toBeNull();
    expect(auditSurfaceLabel(undefined)).toBeNull();
  });
});
