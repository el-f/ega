// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import OptionsTabContent from '@/options/OptionsTabContent.svelte';
import { resetChromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';

const seed = () => parseSettings({});

describe('OptionsTabContent', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('mounts the Translate tab when active=translate', async () => {
    const { container } = render(OptionsTabContent, {
      props: { active: 'translate', s: seed(), onSetSettings: () => {} },
    });
    expect(container.querySelector('.options-pane')).not.toBeNull();
    // The tab is a lazy chunk; under full-suite load its import alone can pass half a second.
    await waitFor(
      () => expect(container.querySelector('[data-ega-tab="translate"]')).not.toBeNull(),
      { timeout: 5000 },
    );
  });

  it('mounts the About tab when active=about', async () => {
    const { container } = render(OptionsTabContent, {
      props: { active: 'about', s: seed(), onSetSettings: () => {} },
    });
    // About card content loads after onMount; just assert pane mounted.
    expect(container.querySelector('.options-pane')).not.toBeNull();
    await waitFor(
      () => expect(container.querySelector('[data-ega-about-version]')).not.toBeNull(),
      { timeout: 5000 },
    );
  });

  it('mounts the Advanced tab when active=advanced', async () => {
    const { container } = render(OptionsTabContent, {
      props: { active: 'advanced', s: seed(), onSetSettings: () => {} },
    });
    expect(container.querySelector('.options-pane')).not.toBeNull();
  });
});
