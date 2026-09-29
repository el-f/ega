// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const AdvancedModule = await import('@/options/tabs/Advanced.svelte');
const Advanced = AdvancedModule.default;

function seedDefaults(): Settings {
  const defaults = parseSettings({});
  chromeMock.storage.local._raw.set('ega.settings', defaults);
  return defaults;
}

function mountAdvanced(s: Settings) {
  return render(Advanced, { props: { s, onSetSettings: () => {} } });
}

let seeded: Settings = parseSettings({});

describe('Advanced tab — V2 IA (diagnostics / data / labs)', () => {
  beforeEach(() => {
    resetChromeMock();
    seeded = seedDefaults();
    try {
      sessionStorage.removeItem('ega-advanced-subtab');
      sessionStorage.removeItem('ega-settings-target');
    } catch {
      // ignore
    }
  });

  it('mounts without errors', async () => {
    const { container } = mountAdvanced(seeded);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeTruthy();
  });

  it('renders only diagnostics/data/labs sub-tabs', async () => {
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 30));
    for (const id of ['diagnostics', 'data', 'labs']) {
      expect(container.querySelector(`[data-ega-subtab="${id}"]`), `sub-tab ${id}`).toBeTruthy();
    }
    for (const id of ['templates', 'generation', 'tunables']) {
      expect(
        container.querySelector(`[data-ega-subtab="${id}"]`),
        `sub-tab ${id} (should be absent)`,
      ).toBeNull();
    }
  });

  it('defaults to diagnostics when no persisted choice + no deep-link', async () => {
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 30));
    const diag = container.querySelector(
      '[data-ega-subtab="diagnostics"]',
    ) as HTMLButtonElement | null;
    expect(diag?.getAttribute('aria-selected')).toBe('true');
  });

  it('redirects to diagnostics when persisted value is V1-only', async () => {
    sessionStorage.setItem('ega-advanced-subtab', 'templates');
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 30));
    const diag = container.querySelector(
      '[data-ega-subtab="diagnostics"]',
    ) as HTMLButtonElement | null;
    expect(diag?.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking Data shows the Reset button', async () => {
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });

    const data = container.querySelector('[data-ega-subtab="data"]') as HTMLButtonElement;
    await fireEvent.click(data);
    await new Promise((r) => setTimeout(r, 0));

    expect(container.querySelector('[data-ega-reset-defaults]')).toBeTruthy();
  });

  it('Labs sub-tab renders the placeholder section', async () => {
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 30));
    const labs = container.querySelector('[data-ega-subtab="labs"]') as HTMLButtonElement;
    expect(labs).toBeTruthy();
    await fireEvent.click(labs);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('section[data-ega-subtab="labs"]')).toBeTruthy();
  });

  it('entry-id deep-link (advanced.auditLog) lands on Diagnostics and marks the audit-log card', async () => {
    sessionStorage.setItem('ega-settings-target', 'advanced.auditLog');
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 0));
    const diag = container.querySelector(
      '[data-ega-subtab="diagnostics"]',
    ) as HTMLButtonElement | null;
    expect(diag?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-ega-setting="advanced.auditLog"]')).toBeTruthy();
  });

  it('entry-id deep-link (advanced.resetEverything) lands on Data and marks the reset card', async () => {
    sessionStorage.setItem('ega-settings-target', 'advanced.resetEverything');
    const { container, findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 0));
    const dat = container.querySelector('[data-ega-subtab="data"]') as HTMLButtonElement | null;
    expect(dat?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-ega-setting="advanced.resetEverything"]')).toBeTruthy();
  });

  it('leaves the pending target in place for deep-link.ts to reveal', async () => {
    sessionStorage.setItem('ega-settings-target', 'advanced.resetEverything');
    const { findByRole } = mountAdvanced(seeded);
    await findByRole('tablist', { name: /Advanced sub-section/i });
    await new Promise((r) => setTimeout(r, 0));
    expect(sessionStorage.getItem('ega-settings-target')).toBe('advanced.resetEverything');
  });
});

describe('Advanced tab — deeplink listener lifecycle', () => {
  beforeEach(() => {
    resetChromeMock();
    seeded = seedDefaults();
    try {
      sessionStorage.removeItem('ega-advanced-subtab');
      sessionStorage.removeItem('ega-settings-target');
    } catch {
      // ignore
    }
  });

  it('registers at most one ega:advanced:deeplink listener after mount+unmount+remount', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const first = mountAdvanced(seeded);
    await new Promise((r) => setTimeout(r, 0));

    const addsBefore = addSpy.mock.calls.filter((c) => c[0] === 'ega:options:deeplink').length;
    expect(addsBefore).toBe(1);

    first.unmount();
    await new Promise((r) => setTimeout(r, 0));

    const removals = removeSpy.mock.calls.filter((c) => c[0] === 'ega:options:deeplink').length;
    expect(removals).toBe(1);

    addSpy.mockClear();

    const second = mountAdvanced(seeded);
    await new Promise((r) => setTimeout(r, 0));

    const addsAfter = addSpy.mock.calls.filter((c) => c[0] === 'ega:options:deeplink').length;
    expect(addsAfter).toBe(1);

    second.unmount();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
