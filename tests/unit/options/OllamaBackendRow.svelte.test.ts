// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import OllamaBackendRow from '@/options/components/OllamaBackendRow.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';

describe('OllamaBackendRow', () => {
  it('mounts and exposes the Discover models button + ollama-step sections', () => {
    const { container } = render(OllamaBackendRow, {
      props: {
        id: asBackendIdUnsafe('ollama'),
        label: 'Ollama (local)',
        settings: DEFAULT_SETTINGS,
        disabled: false,
        routeIsText: false,
        routeIsImage: false,
        onPatch: () => {},
        onModelChange: () => {},
      },
    });
    // Two-step panel: Connection + Model.
    expect(container.querySelectorAll('.ollama-step').length).toBe(2);
    // Discover models button is the user-facing affordance.
    const discoverBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Discover models',
    );
    expect(discoverBtn).toBeDefined();
    expect(discoverBtn?.disabled).toBe(false);
    // Origin disclosure carries the OLLAMA_ORIGINS guidance.
    expect(container.querySelector('.ollama-access')).not.toBeNull();
  });
});
