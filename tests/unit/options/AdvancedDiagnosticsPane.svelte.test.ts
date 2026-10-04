// @vitest-environment jsdom
import type { ComponentProps } from 'svelte';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AdvancedDiagnosticsPane from '@/options/components/AdvancedDiagnosticsPane.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { AUDIT_LOG_CAP } from '@/shared/audit-log';

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

describe('AdvancedDiagnosticsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts and renders audit-log + diagnostics-tools cards', () => {
    const { container } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    expect(container.querySelector('[data-ega-setting="advanced.auditLog"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="advanced.captureResultMeta"]'),
    ).not.toBeNull();
  });

  it('the record-details caption states the request log cap and does not promise an empty tab', () => {
    const { container } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    const text =
      container.querySelector('[data-ega-setting="advanced.captureResultMeta"]')?.textContent ?? '';
    expect(text).toContain(`the request log keeps its last ${AUDIT_LOG_CAP} requests`);
    expect(text).not.toMatch(/empties/i);
  });

  it('the latency histogram caption says the buffer resets when the worker stops', () => {
    const { container } = render(AdvancedDiagnosticsPane, { props: baseProps() });
    const text =
      container.querySelector('[data-ega-setting="advanced.perBackendStats"]')?.textContent ?? '';
    expect(text).toContain('since the background worker last started');
  });

  it('toggling captureResultMeta checkbox invokes onPatchField with (captureResultMeta, newValue)', async () => {
    const onPatchField = vi.fn<Props['onPatchField']>().mockResolvedValue(undefined);
    const { container } = render(AdvancedDiagnosticsPane, {
      props: baseProps({ onPatchField }),
    });

    const checkbox = container.querySelector('#adv-capture-meta') as HTMLInputElement;
    expect(checkbox).not.toBeNull();

    const before = checkbox.checked;
    await fireEvent.change(checkbox, { target: { checked: !before } });

    await waitFor(() => expect(onPatchField).toHaveBeenCalled());
    expect(onPatchField).toHaveBeenCalledWith('captureResultMeta', !before);
  });

  it('changing debugLogLevel select invokes onPatchAdvanced with { debugLogLevel: newValue }', async () => {
    const onPatchAdvanced = vi.fn<Props['onPatchAdvanced']>().mockResolvedValue(undefined);
    const { container } = render(AdvancedDiagnosticsPane, {
      props: baseProps({ onPatchAdvanced }),
    });

    const select = container.querySelector('#adv-log-level') as HTMLSelectElement;
    expect(select).not.toBeNull();

    await fireEvent.change(select, { target: { value: 'info' } });

    await waitFor(() => expect(onPatchAdvanced).toHaveBeenCalled());
    const call = onPatchAdvanced.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toMatchObject({ debugLogLevel: 'info' });
  });

  it('onPatchField payload is not called when checkbox is not changed', async () => {
    const onPatchField = vi.fn<Props['onPatchField']>().mockResolvedValue(undefined);
    render(AdvancedDiagnosticsPane, { props: baseProps({ onPatchField }) });
    // No interaction — handler must not fire.
    expect(onPatchField).not.toHaveBeenCalled();
  });
});
