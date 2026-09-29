// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LabsSection from '@/options/components/sections/LabsSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { makeLabsSectionProps } from './_helpers';
import { ALL_TASKS } from '@/shared/task-prompts';

describe('LabsSection', () => {
  it('renders the 2 experimental knob anchors and nothing about debugLogLevel', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    expect(
      container.querySelector('[data-ega-setting="advanced.taskBackendChains"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="advanced.backendProbeTtlMs"]'),
    ).not.toBeNull();
    // debugLogLevel lives on the Diagnostics sub-tab; Labs carries no stub for it.
    expect(container.querySelector('[data-ega-setting="advanced.debugLogLevel"]')).toBeNull();
    expect(container.textContent).not.toContain('Debug log level');
  });

  it('renders a Labs badge on each knob row', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    const labsBadges = Array.from(container.querySelectorAll('.ega-badge')).filter(
      (b) => b.textContent.trim().toLowerCase() === 'labs',
    );
    expect(labsBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a warning line on each knob row', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    const warns = container.querySelectorAll('.labs-warn');
    expect(warns.length).toBe(2);
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

  it('renders one BackendChainInput per task', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });
    const chains = container.querySelectorAll('[data-ega-backend-chain-input]');
    expect(chains.length).toBe(ALL_TASKS.length);
  });

  it('warn paragraphs carry ids matched by aria-describedby on each control', () => {
    const { container } = render(LabsSection, { props: makeLabsSectionProps() });

    // Chains row: every BackendChainInput input points at labs-chains-warn.
    const chainsWarn = container.querySelector('#labs-chains-warn');
    expect(chainsWarn).not.toBeNull();
    const chainInputs = container.querySelectorAll<HTMLInputElement>(
      '[data-ega-backend-chain-input] input',
    );
    expect(chainInputs.length).toBeGreaterThan(0);
    for (const input of chainInputs) {
      const dby = input.getAttribute('aria-describedby') ?? '';
      expect(dby.split(' ')).toContain('labs-chains-warn');
    }

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
