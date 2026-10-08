// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextLevelPicker from '@/shared/components/ContextLevelPicker.svelte';

describe('ContextLevelPicker', () => {
  it('renders two toggle buttons labeled Minimal / Rich', () => {
    const { getByRole, queryByRole } = render(ContextLevelPicker, {
      props: { value: 'minimal', onchange: vi.fn() },
    });
    expect(getByRole('button', { name: /^Minimal$/ })).toBeTruthy();
    expect(getByRole('button', { name: /^Rich$/ })).toBeTruthy();
    expect(queryByRole('button', { name: /^Off$/ })).toBeNull();
  });

  it('marks the active button with aria-pressed="true"', () => {
    const { getByRole } = render(ContextLevelPicker, {
      props: { value: 'rich', onchange: vi.fn() },
    });
    expect(getByRole('button', { name: /^Minimal$/ }).getAttribute('aria-pressed')).toBe('false');
    expect(getByRole('button', { name: /^Rich$/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('fires onchange with corresponding level on click; same-level click is no-op', async () => {
    const onchange = vi.fn();
    const { getByRole } = render(ContextLevelPicker, {
      props: { value: 'minimal', onchange },
    });
    await fireEvent.click(getByRole('button', { name: /^Rich$/ }));
    expect(onchange).toHaveBeenCalledWith('rich');
    onchange.mockClear();
    await fireEvent.click(getByRole('button', { name: /^Minimal$/ }));
    expect(onchange).not.toHaveBeenCalled();
  });
});

// The task chips mark the picked one with a check; the page-info buttons say it the same way, not by colour alone.
describe('ContextLevelPicker picked mark', () => {
  it('draws a check on the pressed button only', () => {
    const { getByRole } = render(ContextLevelPicker, {
      props: { value: 'rich', onchange: vi.fn() },
    });
    expect(getByRole('button', { name: /^Rich$/ }).querySelector('svg')).not.toBeNull();
    expect(getByRole('button', { name: /^Minimal$/ }).querySelector('svg')).toBeNull();
  });
});
