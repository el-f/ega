// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextLevelPicker from '@/shared/components/ContextLevelPicker.svelte';
import { readFileSync } from 'node:fs';

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
  it('shows the check on the pressed button only, and keeps its slot on the other (R63)', () => {
    const { getByRole } = render(ContextLevelPicker, {
      props: { value: 'rich', onchange: vi.fn() },
    });
    const rich = getByRole('button', { name: /^Rich$/ });
    const minimal = getByRole('button', { name: /^Minimal$/ });
    expect(rich.classList.contains('active')).toBe(true);
    expect(minimal.classList.contains('active')).toBe(false);
    // Both carry the icon, so a pick does not resize the group; CSS hides it on the one not pressed.
    expect(rich.querySelector(':scope > svg')).not.toBeNull();
    expect(minimal.querySelector(':scope > svg')).not.toBeNull();
    const src = readFileSync('src/shared/components/ContextLevelPicker.svelte', 'utf8');
    expect(src).toMatch(
      /\.ctx-level-toggle button:not\(\.active\) > :global\(svg\) \{\s*visibility: hidden;/,
    );
  });
});
