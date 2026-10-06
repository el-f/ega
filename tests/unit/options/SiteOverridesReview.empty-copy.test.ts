// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SiteOverridesReview from '@/options/components/SiteOverridesReview.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

describe('SiteOverridesReview empty state', () => {
  it('names the right-click item, not a popup icon that does not exist', () => {
    const { container } = render(SiteOverridesReview, {
      props: {
        settings: { ...DEFAULT_SETTINGS, sitePrefs: {} },
        onClearKeys: async () => {},
        onClearAll: async () => {},
      },
    });
    const text = container.textContent;
    expect(text).toContain('Disable Ega on this site');
    // Page items show only on empty page space, under the Ega submenu.
    expect(text).toContain('Right-click empty page space and choose Ega ▸');
    expect(text).not.toContain('globe icon');
  });
});
