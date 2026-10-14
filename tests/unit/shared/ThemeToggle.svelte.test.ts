// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ThemeToggle from '@/shared/components/ThemeToggle.svelte';

describe('ThemeToggle radiogroup', () => {
  it('is a single tab stop — only the checked radio is tabbable', () => {
    const { container } = render(ThemeToggle, {
      props: { theme: 'light', onSetTheme: vi.fn() },
    });
    const tabindexByTheme = Object.fromEntries(
      Array.from(container.querySelectorAll<HTMLElement>('[data-ega-theme]')).map((b) => [
        b.dataset['egaTheme'],
        b.getAttribute('tabindex'),
      ]),
    );
    expect(tabindexByTheme).toEqual({ system: '-1', light: '0', dark: '-1' });
  });

  it('ArrowRight / ArrowDown select the next theme', async () => {
    const onSetTheme = vi.fn();
    const { container } = render(ThemeToggle, {
      props: { theme: 'system', onSetTheme },
    });
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]');
    expect(group).not.toBeNull();
    await fireEvent.keyDown(group as HTMLElement, { key: 'ArrowRight' });
    expect(onSetTheme).toHaveBeenLastCalledWith('light');

    // The component is uncontrolled here — `theme` stays 'system', so ArrowDown
    // must produce its own call rather than re-reporting the previous value.
    onSetTheme.mockClear();
    await fireEvent.keyDown(group as HTMLElement, { key: 'ArrowDown' });
    expect(onSetTheme).toHaveBeenCalledTimes(1);
    expect(onSetTheme).toHaveBeenLastCalledWith('light');
  });

  it('ArrowUp moves backwards, wrapping from the first theme to the last', async () => {
    const onSetTheme = vi.fn();
    const { container } = render(ThemeToggle, {
      props: { theme: 'system', onSetTheme },
    });
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]');
    await fireEvent.keyDown(group as HTMLElement, { key: 'ArrowUp' });
    expect(onSetTheme).toHaveBeenCalledTimes(1);
    expect(onSetTheme).toHaveBeenLastCalledWith('dark');
  });

  it('ArrowLeft wraps from the first theme to the last', async () => {
    const onSetTheme = vi.fn();
    const { container } = render(ThemeToggle, {
      props: { theme: 'system', onSetTheme },
    });
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]');
    await fireEvent.keyDown(group as HTMLElement, { key: 'ArrowLeft' });
    expect(onSetTheme).toHaveBeenCalledWith('dark');
  });

  it('moves DOM focus onto the newly selected radio', async () => {
    const { container } = render(ThemeToggle, {
      props: { theme: 'system', onSetTheme: vi.fn() },
    });
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]');
    await fireEvent.keyDown(group as HTMLElement, { key: 'ArrowRight' });
    expect((document.activeElement as HTMLElement | null)?.dataset['egaTheme']).toBe('light');
  });

  it('ignores keys that are not arrows', async () => {
    const onSetTheme = vi.fn();
    const { container } = render(ThemeToggle, {
      props: { theme: 'system', onSetTheme },
    });
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]');
    await fireEvent.keyDown(group as HTMLElement, { key: 'Enter' });
    expect(onSetTheme).not.toHaveBeenCalled();
  });

  it('always renders the text labels', () => {
    const { getByText } = render(ThemeToggle, {
      props: { theme: 'dark', onSetTheme: vi.fn() },
    });
    expect(getByText('System')).toBeTruthy();
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('Dark')).toBeTruthy();
  });
});
