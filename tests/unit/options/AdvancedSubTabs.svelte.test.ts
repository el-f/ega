// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

  // jsdom has no layout, so the rule is read from the source: content-sized tabs grow when the chip appears.
  it('the tabs take equal shares, so an "N changed" chip does not resize them (R63)', () => {
    const src = readFileSync('src/options/components/AdvancedSubTabs.svelte', 'utf8');
    const tab = /:global\(\.adv-sub-tab\) \{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(tab).toMatch(/flex: 1 1 0;/);
  });
});
