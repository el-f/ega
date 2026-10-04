// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LabsSection from '@/options/components/sections/LabsSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { makeLabsSectionProps } from './_helpers';

describe('LabsSection', () => {
  it('renders the probe TTL knob anchor and nothing about debugLogLevel', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    expect(
      container.querySelector('[data-ega-setting="advanced.backendProbeTtlMs"]'),
    ).not.toBeNull();
    // debugLogLevel lives on the Diagnostics sub-tab; Labs carries no stub for it.
    expect(container.querySelector('[data-ega-setting="advanced.debugLogLevel"]')).toBeNull();
    expect(container.textContent).not.toContain('Debug log level');
  });

  it('renders a Labs badge on each knob row', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    const rows = container.querySelectorAll('.labs-row');
    expect(rows.length).toBe(1);
    for (const row of rows) {
      const labsBadges = Array.from(row.querySelectorAll('.ega-badge')).filter(
        (b) => b.textContent.trim().toLowerCase() === 'labs',
      );
      expect(labsBadges).toHaveLength(1);
    }
  });

  it('renders a warning line on each knob row', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    const warns = container.querySelectorAll('.labs-warn');
    expect(warns.length).toBe(1);
    for (const w of warns) {
      expect(w.textContent.trim().length).toBeGreaterThan(0);
    }
  });

  it('mounts the probe TTL slider with the value scaled from ms to seconds', () => {
    const { container } = render(LabsSection, {
      props: makeLabsSectionProps({
        s: { advanced: { ...DEFAULT_SETTINGS.advanced, backendProbeTtlMs: 60_000 } },
      }),
    });
    const slider = container.querySelector(
      '[data-ega-setting="advanced.backendProbeTtlMs"] [role="slider"]',
    );
    expect(slider).not.toBeNull();
    // bits-ui Slider exposes the current value via aria-valuenow.
    expect(slider?.getAttribute('aria-valuenow')).toBe('60');
  });

  it('the warn paragraph carries the id matched by aria-describedby on the slider', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });

    // Probe TTL slider: thumb's describedby chain includes labs-probe-warn.
    const probeWarn = container.querySelector('#labs-probe-warn');
    expect(probeWarn).not.toBeNull();
    const probeThumb = container.querySelector(
      '[data-ega-setting="advanced.backendProbeTtlMs"] [role="slider"]',
    );
    expect(probeThumb).not.toBeNull();
    const probeDby = probeThumb?.getAttribute('aria-describedby') ?? '';
    expect(probeDby.split(' ')).toContain('labs-probe-warn');
  });
});
