// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AdvancedSubTabs from '@/options/components/AdvancedSubTabs.svelte';
import SettingsListView from '@/options/components/SettingsListView.svelte';

// A plain <span> has the generic role, and ARIA drops aria-label there.
describe('aria-label needs a role to survive', () => {
  it('the sub-tab count badge carries a role', () => {
    const { container } = render(AdvancedSubTabs, {
      props: { active: 'diagnostics', modifiedCounts: { data: 3 }, onSelect: vi.fn() },
    });
    const badge = container.querySelector('[data-ega-subtab-modified-count="data"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('aria-label')).toBe('3 modified');
    expect(badge?.getAttribute('role')).toBe('img');
  });

  it('the modified badge carries a role', () => {
    const { container } = render(SettingsListView, {
      props: {
        item: {
          id: 'a',
          label: 'Tone',
          description: 'How the reply sounds',
          tab: 'general',
          modified: true,
        },
        optionProps: {},
      },
    });
    const badge = container.querySelector('.slv-modified-badge');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('aria-label')).toBe('Modified');
    expect(badge?.getAttribute('role')).toBe('img');
  });
});
