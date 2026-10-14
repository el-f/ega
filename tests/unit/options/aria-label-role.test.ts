// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AdvancedSubTabs from '@/options/components/AdvancedSubTabs.svelte';
import SettingsListView from '@/options/components/SettingsListView.svelte';

// A plain <span> has the generic role, and ARIA drops aria-label there.
describe('aria-label needs a role to survive', () => {
  it('the sub-tab count badge says what it counts in visible text', () => {
    const { container } = render(AdvancedSubTabs, {
      props: { active: 'diagnostics', modifiedCounts: { data: 3 }, onSelect: vi.fn() },
    });
    const badge = container.querySelector('[data-ega-subtab-modified-count="data"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent.trim()).toBe('3 changed');
  });

  it('the sub-tab reads "3 settings changed from their default" to a screen reader (O-103)', () => {
    const { getByRole } = render(AdvancedSubTabs, {
      props: { active: 'diagnostics', modifiedCounts: { data: 3 }, onSelect: vi.fn() },
    });
    const tab = getByRole('tab', { name: /^Data/ });
    expect(tab.querySelector('[data-ega-subtab-modified-count]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(tab.querySelector('.ega-sr-only')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      ', 3 settings changed from their default',
    );
  });

  it('the changed marker is the word itself, so it needs no aria-label or role', () => {
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
    expect(badge?.textContent.trim()).toBe('Changed');
    expect(badge?.hasAttribute('aria-label')).toBe(false);
  });
});
