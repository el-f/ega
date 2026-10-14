// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AdvancedSubTabs from '@/options/components/AdvancedSubTabs.svelte';

describe('AdvancedSubTabs — V2 IA sub-tab list', () => {
  it('renders Data first, then Diagnostics', () => {
    const { container } = render(AdvancedSubTabs, {
      props: { active: 'data', onSelect: vi.fn() },
    });
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(Array.from(tabs).map((t) => t.getAttribute('data-ega-subtab'))).toEqual([
      'data',
      'diagnostics',
    ]);
  });
});
