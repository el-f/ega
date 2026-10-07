// @vitest-environment jsdom
import type { ComponentProps } from 'svelte';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AdvancedDiagnosticsPane from '@/options/components/AdvancedDiagnosticsPane.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { AUDIT_LOG_CAP } from '@/shared/audit-log';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';

type Props = ComponentProps<typeof AdvancedDiagnosticsPane>;

function baseProps(
  overrides: {
    s?: Settings;
    onPatchField?: Mock<Props['onPatchField']>;
    onPatchAdvanced?: Mock<Props['onPatchAdvanced']>;
  } = {},
) {
  return {
    s: DEFAULT_SETTINGS,
    onPatchField: vi.fn<Props['onPatchField']>().mockResolvedValue(undefined),
    onPatchAdvanced: vi.fn<Props['onPatchAdvanced']>().mockResolvedValue(undefined),
    ...overrides,
  };
}

const describedText = (el: Element | null): string =>
  (el?.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('AdvancedDiagnosticsPane', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.clearAllMocks();
  });

  it('has Recent requests, Response times, Recent errors, then Diagnostics settings', () => {
    const { getAllByRole } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    expect(getAllByRole('heading', { level: 2 }).map((h) => h.textContent.trim())).toEqual([
      'Recent requests',
      'Response times',
      'Recent errors',
      'Diagnostics settings',
    ]);
  });

  it('Record request details has a one-line hint, and the (i) holds the rest', () => {
    const { getByRole } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    expect(describedText(getByRole('checkbox', { name: 'Record request details' }))).toContain(
      'Keeps timing and token counts for each request',
    );
    expect(describedText(getByRole('button', { name: 'About diagnostics' }))).toBe(
      `Turning off Record request details stops response times. The request list keeps its last ${AUDIT_LOG_CAP} requests.`,
    );
  });

  it('Log detail names its levels in words and has no per-field reset', () => {
    const { getByLabelText, container } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    const select = getByLabelText('Log detail');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent.trim())).toEqual([
      'Off',
      'Errors',
      'Warnings (default)',
      'Info',
      'Everything',
    ]);
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('toggling Record request details patches captureResultMeta', async () => {
    const onPatchField = vi.fn<Props['onPatchField']>().mockResolvedValue(undefined);
    const { container } = render(AdvancedDiagnosticsPane, { props: baseProps({ onPatchField }) });
    const checkbox = container.querySelector('#adv-capture-meta') as HTMLInputElement;
    const before = checkbox.checked;
    await fireEvent.change(checkbox, { target: { checked: !before } });
    await waitFor(() => expect(onPatchField).toHaveBeenCalledWith('captureResultMeta', !before));
  });

  it('changing Log detail patches debugLogLevel', async () => {
    const onPatchAdvanced = vi.fn<Props['onPatchAdvanced']>().mockResolvedValue(undefined);
    const { container } = render(AdvancedDiagnosticsPane, {
      props: baseProps({ onPatchAdvanced }),
    });
    await fireEvent.change(container.querySelector('#adv-log-level') as HTMLSelectElement, {
      target: { value: 'info' },
    });
    await waitFor(() => expect(onPatchAdvanced).toHaveBeenCalledWith({ debugLogLevel: 'info' }));
  });

  it('Copy data sits in the Response times header once the worker sent times, and copies them', async () => {
    const entries = [{ backendId: 'anthropic', cacheHit: false, latencyMs: 120, ts: 1 }];
    (chromeMock.runtime.sendMessage as Mock).mockImplementation(async (m: { kind?: string }) =>
      m.kind === 'perf:entries' ? { entries } : undefined,
    );
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { findByRole } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    const copy = await findByRole('button', { name: 'Copy data' });
    expect(copy.closest('.ega-section-card-actions')).not.toBeNull();
    await fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(entries, null, 2)));
    await waitFor(() => expect(copy.textContent.trim()).toBe('Copied'));
  });

  it('with recording off: Response times says how to turn it on, and has no Copy data', async () => {
    (chromeMock.runtime.sendMessage as Mock).mockResolvedValue({
      entries: [{ backendId: 'anthropic', cacheHit: false, latencyMs: 120, ts: 1 }],
    });
    const { container, queryByRole } = render(AdvancedDiagnosticsPane, {
      props: baseProps({ s: { ...DEFAULT_SETTINGS, captureResultMeta: false } }),
    });
    await waitFor(() => expect(chromeMock.runtime.sendMessage).toHaveBeenCalled());
    expect(container.querySelector('[data-ega-perf-off]')?.textContent.trim()).toBe(
      'Response times are off. Turn on Record request details below.',
    );
    expect(queryByRole('button', { name: 'Copy data' })).toBeNull();
  });
});
