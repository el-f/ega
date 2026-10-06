// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TabHeader from '@/shared/components/TabHeader.svelte';
import { TAB_DESCRIPTIONS, TAB_LABELS } from '@/shared/settings-tabs';

describe('TabHeader', () => {
  it('is the tab title plus its one line, with no (i) unless asked', () => {
    const { getByRole, queryByRole, getByText } = render(TabHeader, { props: { tab: 'backends' } });
    expect(getByRole('heading', { level: 1, name: TAB_LABELS.backends })).toBeTruthy();
    expect(getByText(TAB_DESCRIPTIONS.backends)).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it('puts the longer help behind an (i) named "About …" next to the title', () => {
    const { getByRole } = render(TabHeader, {
      props: {
        tab: 'backends',
        info: { label: 'About backends', text: 'Cloud backends use your API key.' },
      },
    });
    expect(getByRole('button', { name: 'About backends' })).toBeTruthy();
  });
});
