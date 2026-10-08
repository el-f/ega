// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { toastStore } from '@/shared/components/toastStore';
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

  it('with the picker off, its shortcut stays focusable, says why, and does not record', async () => {
    const { getByRole } = render(ElementPickerSection, {
      props: makeSectionProps({ s: { pickerEnabled: false } }),
    });
    const record = getByRole('button', { name: 'Record element picker shortcut' });
    expect(record.hasAttribute('disabled')).toBe(false);
    expect(record.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(record.getAttribute('aria-describedby') ?? '')?.textContent.trim(),
    ).toBe('Turn on the element picker to use this shortcut');
    await fireEvent.click(record);
    expect(record.getAttribute('aria-pressed')).toBe('false');
  });

  it('names the toggle "Turn on the element picker", with its one-line hint', () => {
    const { getByRole } = render(ElementPickerSection, { props: makeSectionProps() });
    const box = getByRole('checkbox', { name: 'Turn on the element picker' });
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain('dsp-picker-hint');
    expect(document.getElementById('dsp-picker-hint')?.textContent).toBe(
      'Hover an element to outline it, click to translate, Esc cancels',
    );
  });

  it('a combo the other shortcut has is refused under its row, and nothing is saved', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { getByRole, findByRole } = render(ElementPickerSection, {
      props: makeSectionProps({
        s: { pickerEnabled: true, shortcut: 'Ctrl+Shift+L', pickerShortcut: '' },
        onPatch,
      }),
    });
    const record = getByRole('button', { name: 'Record element picker shortcut' });
    await fireEvent.click(record);
    await fireEvent.keyDown(record, { key: 'l', ctrlKey: true, shiftKey: true });
    expect((await findByRole('alert')).textContent).toBe(
      'Ctrl+Shift+L is already the Translate selection shortcut. Pick another.',
    );
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('the last row says Ega opens from a Chrome shortcut', () => {
    const { container } = render(ElementPickerSection, { props: makeSectionProps() });
    expect(container.textContent).toContain('Open Ega');
    expect(container.textContent).toContain('Set in Chrome');
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

  it('names each Record and Clear button after its row', () => {
    const { getByRole } = render(ElementPickerSection, {
      props: makeSectionProps({
        s: { pickerEnabled: true, pickerShortcut: 'Ctrl+Shift+K', shortcut: 'Ctrl+Shift+L' },
      }),
    });
    expect(getByRole('button', { name: 'Record element picker shortcut' })).toBeTruthy();
    expect(getByRole('button', { name: 'Clear element picker shortcut' })).toBeTruthy();
    expect(getByRole('button', { name: 'Record Translate selection shortcut' })).toBeTruthy();
    expect(getByRole('button', { name: 'Clear Translate selection shortcut' })).toBeTruthy();
  });
});

describe('ElementPickerSection — the browser-wide shortcut', () => {
  it('opens Chrome shortcuts from a button, since a chrome:// link cannot be clicked', async () => {
    // The shared chrome mock has no tabs.create, so the test supplies one.
    const create = vi.fn(async () => ({}));
    Object.assign(chrome.tabs, { create });
    const { getByRole } = render(ElementPickerSection, { props: makeSectionProps() });
    await fireEvent.click(getByRole('button', { name: /Open Chrome shortcuts/ }));
    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    Reflect.deleteProperty(chrome.tabs, 'create');
  });

  it('says how to get there by hand when Chrome refuses to open the tab', async () => {
    Object.assign(chrome.tabs, { create: vi.fn(async () => Promise.reject(new Error('nope'))) });
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    try {
      const { getByRole } = render(ElementPickerSection, { props: makeSectionProps() });
      await fireEvent.click(getByRole('button', { name: /Open Chrome shortcuts/ }));
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('chrome://extensions/shortcuts'),
          }),
        ),
      );
    } finally {
      push.mockRestore();
      Reflect.deleteProperty(chrome.tabs, 'create');
    }
  });

  // X14: the warning stays until closed, so trying again closes the old one first.
  it('Open Chrome shortcuts again closes the warning the last try left', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce({});
    Object.assign(chrome.tabs, { create });
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const close = vi.spyOn(toastStore, 'close').mockImplementation(() => {});
    try {
      const { getByRole } = render(ElementPickerSection, { props: makeSectionProps() });
      const open = getByRole('button', { name: /Open Chrome shortcuts/ });
      await fireEvent.click(open);
      await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      const warning = push.mock.calls[0]?.[0];
      close.mockClear();
      await fireEvent.click(open);
      await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
      expect(close).toHaveBeenCalledWith(warning?.key ?? warning?.message);
    } finally {
      push.mockRestore();
      close.mockRestore();
      Reflect.deleteProperty(chrome.tabs, 'create');
    }
  });
});
