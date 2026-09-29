// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AdvancedSubTabs from '@/options/components/AdvancedSubTabs.svelte';

describe('AdvancedSubTabs — V2 IA sub-tab list', () => {
  it('renders 3 sub-tabs (diagnostics / data / labs)', () => {
    const { container } = render(AdvancedSubTabs, {
      props: { active: 'diagnostics', onSelect: vi.fn() },
    });
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    const ids = Array.from(tabs).map((t) => t.getAttribute('data-ega-subtab'));
    expect(ids).toContain('diagnostics');
    expect(ids).toContain('data');
    expect(ids).toContain('labs');
  });
});
