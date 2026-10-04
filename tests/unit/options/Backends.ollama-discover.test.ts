// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Backends from '@/options/tabs/Backends.svelte';
import { parseSettings } from '@/shared/settings-schema';

function mountBackends() {
  return render(Backends, { props: { s: parseSettings({}), onSetSettings: () => {} } });
}

// Helper: poll until the Ollama section is rendered (settings loaded).
async function waitForOllamaSection(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.querySelector('[data-section="local"]')).not.toBeNull());
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent.trim() === label,
  ) as HTMLButtonElement | undefined;
}

describe('Backends — Ollama discover button loading state', () => {
  it('renders "Discover models" label and enabled state by default', async () => {
    const { container } = mountBackends();
    await waitForOllamaSection(container);

    const btn = findButton(container, 'Discover models');
    expect(btn).not.toBeUndefined();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('switches to "Discovering…" and disables button while fetch is in flight', async () => {
    // Hold /api/tags; the flag is set before the first await, so the button flips at once.
    let releaseHold!: (r: Response) => void;
    const hold = new Promise<Response>((resolve) => {
      releaseHold = resolve;
    });
    // Mock all fetch calls: first call gets hold, subsequent calls get empty tags.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => hold);

    const { container } = mountBackends();
    await waitForOllamaSection(container);

    const btn = findButton(container, 'Discover models');
    expect(btn).not.toBeUndefined();

    await fireEvent.click(btn as HTMLButtonElement);
    // Flush Svelte 5 runes reactivity across multiple microtask ticks.
    await tick();
    await tick();
    await tick();

    // The button should now show 'Discovering…' and be disabled.
    const discovering = findButton(container, 'Discovering…');
    expect(discovering).not.toBeUndefined();
    expect((discovering as HTMLButtonElement).disabled).toBe(true);

    // Unblock the fetch to let the component clean up.
    releaseHold(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.restoreAllMocks();
  });

  it('restores "Discover models" label and enabled state after fetch resolves', async () => {
    // Immediately resolve with an empty models list.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { container } = mountBackends();
    await waitForOllamaSection(container);

    const btn = findButton(container, 'Discover models');
    await fireEvent.click(btn as HTMLButtonElement);

    // Wait for the async handler to settle and the button to revert.
    await waitFor(
      () => {
        const restored = findButton(container, 'Discover models');
        expect(restored).not.toBeUndefined();
        expect((restored as HTMLButtonElement).disabled).toBe(false);
      },
      { timeout: 1000 },
    );

    vi.restoreAllMocks();
  });
});
