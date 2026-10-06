// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Toast from '@/content/Toast.svelte';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast component', () => {
  it('renders the message text', () => {
    const { getByText } = render(Toast, {
      props: { message: 'Nothing to translate here.', ondismiss: vi.fn() },
    });
    expect(getByText('Nothing to translate here.')).toBeTruthy();
  });

  it('is a polite status by default and an alert for a warning or an error', () => {
    const info = render(Toast, { props: { message: 'hi', ondismiss: vi.fn() } });
    expect(info.getByRole('status').textContent).toContain('hi');
    info.unmount();
    const err = render(Toast, { props: { message: 'Failed', kind: 'error', ondismiss: vi.fn() } });
    expect(err.getByRole('alert').textContent).toContain('Failed');
  });

  it('renders no action button when the caller gives none', () => {
    const { container } = render(Toast, { props: { message: 'hi', ondismiss: vi.fn() } });
    expect(container.querySelector('[data-ega-toast-action]')).toBeNull();
  });

  it('runs the action on click', () => {
    const onaction = vi.fn();
    const { getByRole } = render(Toast, {
      props: {
        message: 'Ega was updated',
        actionLabel: 'Reload page',
        onaction,
        ondismiss: vi.fn(),
      },
    });
    getByRole('button', { name: 'Reload page' }).click();
    expect(onaction).toHaveBeenCalledTimes(1);
  });

  it('has a Dismiss button inside, after the action', () => {
    const ondismiss = vi.fn();
    const { getAllByRole } = render(Toast, {
      props: { message: 'x', actionLabel: 'Undo', onaction: vi.fn(), ondismiss },
    });
    const buttons = getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Undo',
      'Dismiss',
    ]);
    buttons[1]?.click();
    expect(ondismiss).toHaveBeenCalledTimes(1);
  });

  it('Esc closes it while focus is inside', async () => {
    const ondismiss = vi.fn();
    const { getByRole } = render(Toast, { props: { message: 'x', ondismiss } });
    await fireEvent.keyDown(getByRole('button', { name: 'Dismiss' }), { key: 'Escape' });
    expect(ondismiss).toHaveBeenCalledTimes(1);
  });

  it('a plain confirmation hides itself after 6 s, and waits while the pointer is on it', async () => {
    vi.useFakeTimers();
    const ondismiss = vi.fn();
    const { getByRole } = render(Toast, {
      props: { message: 'Copied', kind: 'success', ondismiss },
    });
    await fireEvent.pointerOver(getByRole('status'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ondismiss).not.toHaveBeenCalled();
    await fireEvent.pointerOut(getByRole('status'), { relatedTarget: document.body });
    await vi.advanceTimersByTimeAsync(5900);
    expect(ondismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(ondismiss).toHaveBeenCalledTimes(1);
  });

  it('waits while focus is inside', async () => {
    vi.useFakeTimers();
    const ondismiss = vi.fn();
    const { getByRole } = render(Toast, {
      props: { message: 'Copied', kind: 'success', ondismiss },
    });
    await fireEvent.focusIn(getByRole('button', { name: 'Dismiss' }));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ondismiss).not.toHaveBeenCalled();
  });

  it('an Undo hides after 8 s, and waits while the pointer is on it', async () => {
    vi.useFakeTimers();
    const ondismiss = vi.fn();
    const { getByRole } = render(Toast, {
      props: { message: 'x', kind: 'success', actionLabel: 'Undo', onaction: vi.fn(), ondismiss },
    });
    await fireEvent.pointerOver(getByRole('status'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ondismiss).not.toHaveBeenCalled();
    await fireEvent.pointerOut(getByRole('status'), { relatedTarget: document.body });
    await vi.advanceTimersByTimeAsync(7900);
    expect(ondismiss).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(ondismiss).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an instruction', { kind: 'info' }],
    ['an error', { kind: 'error' }],
    ['a Reload page', { kind: 'warning', actionLabel: 'Reload page', onaction: () => {} }],
  ] as const)('%s stays until dismissed', async (_name, extra) => {
    vi.useFakeTimers();
    const ondismiss = vi.fn();
    render(Toast, { props: { message: 'x', ondismiss, ...extra } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ondismiss).not.toHaveBeenCalled();
  });
});
