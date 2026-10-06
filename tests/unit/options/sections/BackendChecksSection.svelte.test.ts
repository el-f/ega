// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import BackendChecksSection from '@/options/components/sections/BackendChecksSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { settingHint } from '@/shared/settings-registry';
import type { Settings } from '@/shared/types';

const s = (): Settings => structuredClone(DEFAULT_SETTINGS);

describe('BackendChecksSection (Timeouts and checks)', () => {
  it('holds both answer timeouts, the local check timeout and backend status memory', () => {
    const { container, getByText } = render(BackendChecksSection, {
      props: { s: s(), onPatch: vi.fn() },
    });
    for (const id of [
      'advanced.translateTimeoutMs',
      'advanced.imageTranslateTimeoutMs',
      'backends.localBackendTimeoutMs',
      'advanced.backendProbeTtlMs',
    ]) {
      const row = container.querySelector(`[data-ega-setting="${id}"]`);
      expect(row, id).not.toBeNull();
      expect(row?.querySelector('[data-ega-hint]')?.textContent.trim(), id).toBe(settingHint(id));
      // The default shows as a tick on the track, read as part of the description.
      expect(row?.querySelector('[data-ega-default-tick]'), id).not.toBeNull();
    }
    expect(getByText('Experimental')).toBeTruthy();
  });

  it('writes seconds back as milliseconds when the thumb is released', async () => {
    const onPatch = vi.fn();
    const { container } = render(BackendChecksSection, { props: { s: s(), onPatch } });
    const thumb = container.querySelector<HTMLElement>(
      '[data-ega-setting="advanced.translateTimeoutMs"] [role="slider"]',
    );
    thumb?.focus();
    await fireEvent.keyDown(thumb as HTMLElement, { key: 'ArrowRight' });
    await fireEvent.keyUp(thumb as HTMLElement, { key: 'ArrowRight' });
    expect(onPatch).toHaveBeenCalledWith({
      translateTimeoutMs: (DEFAULT_SETTINGS.translateTimeoutMs ?? 60_000) + 10_000,
    });
  });

  it('a second press before the first write lands starts from the released value', async () => {
    // The write settles only when the test says so, as a slow storage write would.
    const pending: (() => void)[] = [];
    const onPatch = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)));
    const { container } = render(BackendChecksSection, { props: { s: s(), onPatch } });
    const thumb = container.querySelector<HTMLElement>(
      '[data-ega-setting="advanced.backendProbeTtlMs"] [role="slider"]',
    ) as HTMLElement;
    thumb.focus();
    for (let i = 0; i < 2; i++) {
      await fireEvent.keyDown(thumb, { key: 'ArrowRight' });
      await fireEvent.keyUp(thumb, { key: 'ArrowRight' });
    }
    const base = DEFAULT_SETTINGS.advanced.backendProbeTtlMs;
    expect(onPatch).toHaveBeenLastCalledWith({ advanced: { backendProbeTtlMs: base + 10_000 } });
    pending.forEach((resolve) => resolve());
  });
});
