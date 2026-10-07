// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import About from '@/options/tabs/About.svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import pkg from '../../../package.json' with { type: 'json' };

const norm = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();

describe('About', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('Credits and links: label left, value right, the version with no changelog link', () => {
    const { container, getByRole } = render(About);
    expect(getByRole('heading', { name: 'Credits and links' })).toBeTruthy();
    const rows = [...container.querySelectorAll('.about-row')].map((r) => [
      norm(r.querySelector('dt')?.textContent),
      norm(r.querySelector('dd')?.textContent),
    ]);
    expect(rows).toEqual([
      ['Version', pkg.version],
      ['Source', 'github.com/el-f/ega'],
      ['License', 'MIT'],
    ]);
    expect(container.querySelector('a[href*="CHANGELOG"]')).toBeNull();
  });

  it('shows the full pre-release version_name, not the numeric version', () => {
    const spy = vi
      .spyOn(chromeMock.runtime, 'getManifest')
      .mockReturnValue({ version: '0.1.0', version_name: '0.1.0-rc.1' });
    try {
      const { container } = render(About);
      expect(norm(container.querySelector('[data-ega-about-version] dd')?.textContent)).toBe(
        '0.1.0-rc.1',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('Privacy: three columns of what is stored, what is sent and what never is', () => {
    const { getAllByRole, container } = render(About);
    expect(getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Stored on this computer',
      'Sent to your backend',
      'Never sent',
    ]);
    expect(container.textContent).toContain(
      'API keys stay in this browser. They are never synced or logged.',
    );
  });

  it('has no destructive actions: they moved to Advanced, Data', () => {
    const { queryByRole } = render(About);
    expect(queryByRole('button', { name: /Delete all data|Clear cache/ })).toBeNull();
  });
});
