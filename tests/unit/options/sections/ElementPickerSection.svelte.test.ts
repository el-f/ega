// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ElementPickerSection from '@/options/components/sections/ElementPickerSection.svelte';
import { makeSectionProps, type OnPatch } from './_helpers';

describe('ElementPickerSection', () => {
  it('renders the pickerEnabled toggle anchor', () => {
    const { container } = render(ElementPickerSection, { props: makeSectionProps() });
    expect(container.querySelector('[data-ega-setting="display.pickerEnabled"]')).not.toBeNull();
  });

  it('renders the translate-shortcut anchor', () => {
    const { container } = render(ElementPickerSection, { props: makeSectionProps() });
    expect(container.querySelector('[data-ega-setting="display.shortcut"]')).not.toBeNull();
  });

  it('hides the pickerShortcut input when pickerEnabled is false', () => {
    const { container } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { pickerEnabled: false } }),
    });
    expect(container.querySelector('[data-ega-setting="display.pickerShortcut"]')).toBeNull();
  });

  it('shows the pickerShortcut input when pickerEnabled is true', () => {
    const { container } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { pickerEnabled: true } }),
    });
    expect(container.querySelector('[data-ega-setting="display.pickerShortcut"]')).not.toBeNull();
  });

  it('fires onPatch when toggling pickerEnabled', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { pickerEnabled: true }, onPatch }),
    });
    const cb = container.querySelector<HTMLInputElement>('#dsp-picker-enabled');
    if (!cb) throw new Error('pickerEnabled checkbox not rendered');
    await fireEvent.click(cb);
    expect(onPatch).toHaveBeenCalledWith({ pickerEnabled: false });
  });

  it('shows no modified dot when both shortcuts are at their defaults', () => {
    const { container } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { pickerEnabled: true } }),
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });

  it('flags the picker shortcut as modified when it diverges from the default', () => {
    const { container } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { pickerEnabled: true, pickerShortcut: 'Ctrl+Shift+K' } }),
    });
    const dot = container.querySelector(
      '[data-ega-setting="display.pickerShortcut"] [data-ega-modified="true"]',
    );
    expect(dot).not.toBeNull();
  });

  it('flags the translate shortcut as modified when it diverges from the default', () => {
    const { container } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { shortcut: 'Ctrl+Shift+K' } }),
    });
    const dot = container.querySelector(
      '[data-ega-setting="display.shortcut"] [data-ega-modified="true"]',
    );
    expect(dot).not.toBeNull();
  });

  it('gives each Clear button a distinct accessible name', () => {
    const { getByRole } = render(ElementPickerSection, {
      props: makeSectionProps({
        s: { pickerEnabled: true, pickerShortcut: 'Ctrl+Shift+K', shortcut: 'Ctrl+Shift+L' },
      }),
    });
    expect(getByRole('button', { name: 'Clear element picker shortcut' })).toBeTruthy();
    expect(getByRole('button', { name: 'Clear translate shortcut' })).toBeTruthy();
  });
});

describe('ElementPickerSection — the browser-wide shortcut', () => {
  it('opens Chrome shortcuts from a button, since a chrome:// link cannot be clicked', async () => {
    // The shared chrome mock has no tabs.create, so the test supplies one.
    const create = vi.fn();
    Object.assign(chrome.tabs, { create });
    const { getByRole } = render(ElementPickerSection, { props: makeSectionProps() });
    await fireEvent.click(getByRole('button', { name: /Open Chrome shortcuts/ }));
    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    Reflect.deleteProperty(chrome.tabs, 'create');
  });
});
