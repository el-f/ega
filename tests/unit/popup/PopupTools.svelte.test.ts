// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PopupTools from '@/popup/PopupTools.svelte';

describe('PopupTools', () => {
  const base = {
    onTranslatePage: vi.fn(),
    onPickElement: vi.fn(),
    onClipboard: vi.fn(),
    onOpenSidePanel: vi.fn(),
    pickerEnabled: true,
  };

  it('renders four trigger tiles reachable by aria-label', () => {
    const { getByRole } = render(PopupTools, { props: base });
    expect(getByRole('button', { name: /Translate this page/i })).toBeTruthy();
    expect(getByRole('button', { name: /Pick element/i })).toBeTruthy();
    expect(getByRole('button', { name: /Translate clipboard contents/i })).toBeTruthy();
    expect(getByRole('button', { name: /Open side panel/i })).toBeTruthy();
  });

  it('Page tile click fires onTranslatePage', async () => {
    const onTranslatePage = vi.fn();
    const { getByRole } = render(PopupTools, { props: { ...base, onTranslatePage } });
    await fireEvent.click(getByRole('button', { name: /Translate this page/i }));
    expect(onTranslatePage).toHaveBeenCalled();
  });

  it('Pick tile is disabled when pickerEnabled=false', () => {
    const { getByRole } = render(PopupTools, {
      props: { ...base, pickerEnabled: false },
    });
    const btn = getByRole('button', { name: /Pick element/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disabled Pick tile shows the reason as always-visible text', () => {
    const { getByRole } = render(PopupTools, {
      props: { ...base, pickerEnabled: false },
    });
    const btn = getByRole('button', { name: /Pick element/i }) as HTMLButtonElement;
    const hint = btn.querySelector('.tile-hint');
    expect(hint?.textContent).toContain('Settings');
    expect(hint?.textContent).toContain('Selection & picker');
  });

  it('disabled Pick tile carries the reason in its accessible name', () => {
    const { getByRole } = render(PopupTools, {
      props: { ...base, pickerEnabled: false },
    });
    const btn = getByRole('button', { name: /Pick element/i }) as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toContain('Selection & picker');
  });

  it('enabled Pick tile has no hint text', () => {
    const { getByRole } = render(PopupTools, {
      props: { ...base, pickerEnabled: true },
    });
    const btn = getByRole('button', { name: /Pick element/i }) as HTMLButtonElement;
    expect(btn.querySelector('.tile-hint')).toBeNull();
  });

  it('visible tile labels name the action, not one word', () => {
    const { container } = render(PopupTools, { props: base });
    const labels = Array.from(container.querySelectorAll('.tile-label')).map((el) =>
      String(el.textContent).trim(),
    );
    expect(labels).toEqual([
      'Translate this page',
      'Pick element',
      'Translate clipboard',
      'Side panel',
    ]);
  });

  it('Clipboard tile click fires onClipboard', async () => {
    const onClipboard = vi.fn();
    const { getByRole } = render(PopupTools, { props: { ...base, onClipboard } });
    await fireEvent.click(getByRole('button', { name: /Translate clipboard contents/i }));
    expect(onClipboard).toHaveBeenCalled();
  });

  it('Panel tile click fires onOpenSidePanel', async () => {
    const onOpenSidePanel = vi.fn();
    const { getByRole } = render(PopupTools, { props: { ...base, onOpenSidePanel } });
    await fireEvent.click(getByRole('button', { name: /Open side panel/i }));
    expect(onOpenSidePanel).toHaveBeenCalled();
  });
});
