// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ComposerOptions from '@/sidepanel/conversation/ComposerOptions.svelte';

const baseProps = () => ({
  pageContextLevel: 'minimal' as const,
  contextEnabled: true,
  historyLabel: null as string | null,
  streaming: true,
  onContextLevelChange: vi.fn(),
  onToggleStreaming: vi.fn(),
  onOpenOptions: vi.fn(),
});

async function open(): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: 'Message options' }));
  await screen.findByRole('dialog', { name: 'Message options' });
}

describe('ComposerOptions', () => {
  it('keeps the settings closed until the button is pressed, and says so', async () => {
    render(ComposerOptions, { props: baseProps() });
    const btn = screen.getByRole('button', { name: 'Message options' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows what each page-info level sends as text, not only as a tooltip', async () => {
    const { rerender } = render(ComposerOptions, { props: baseProps() });
    await open();
    expect(screen.getByText('Page title and URL.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Minimal' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await rerender({ ...baseProps(), pageContextLevel: 'rich' });
    expect(screen.getByText(/Also the page language/)).toBeTruthy();
  });

  it('writes a page-info change through', async () => {
    const props = baseProps();
    render(ComposerOptions, { props });
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Rich' }));
    expect(props.onContextLevelChange).toHaveBeenCalledWith('rich');
  });

  it.each([true, false])('live reply checkbox reflects streaming=%s and flips it', async (on) => {
    const props = { ...baseProps(), streaming: on };
    render(ComposerOptions, { props });
    await open();
    const box = screen.getByRole('checkbox', { name: 'Show the reply as it is written' });
    expect((box as HTMLInputElement).checked).toBe(on);
    expect(box.hasAttribute('data-ega-streaming-toggle')).toBe(true);
    await fireEvent.click(box);
    expect(props.onToggleStreaming).toHaveBeenCalledExactlyOnceWith(!on);
  });

  it('replaces the level picker with a route to Settings when page info is off', async () => {
    const props = { ...baseProps(), contextEnabled: false };
    render(ComposerOptions, { props });
    await open();
    expect(screen.queryByRole('button', { name: 'Rich' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Turn it on in Settings' }));
    expect(props.onOpenOptions).toHaveBeenCalledTimes(1);
  });

  it('names the earlier messages that go with the next send, only when there are some', async () => {
    const { unmount } = render(ComposerOptions, { props: baseProps() });
    await open();
    expect(document.querySelector('.ega-context-label')).toBeNull();
    unmount();
    render(ComposerOptions, {
      props: { ...baseProps(), historyLabel: 'Using 4 earlier messages' },
    });
    await open();
    expect(document.querySelector('.ega-context-label')?.textContent).toContain(
      'Using 4 earlier messages',
    );
  });
});
