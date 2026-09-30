// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import InspectorDrawer from '@/shared/components/InspectorDrawer.svelte';
import { asBackendIdUnsafe } from '@/shared/brands';

function rowValue(container: HTMLElement, label: string): string | null {
  const row = [...container.querySelectorAll('.inspector-row')].find(
    (r) => r.querySelector('dt')?.textContent.trim() === label,
  );
  return row?.querySelector('dd')?.textContent.trim() ?? null;
}

describe('InspectorDrawer token counts', () => {
  it('shows the token counts the provider reported and no row for an absent one', () => {
    const { container } = render(InspectorDrawer, {
      props: {
        meta: {
          backendId: asBackendIdUnsafe('anthropic'),
          cacheHit: false,
          latencyMs: 1,
          inputTokens: 12,
          outputTokens: 34,
        },
        open: true,
        onClose: () => {},
      },
    });
    expect(rowValue(container, 'Input tokens')).toBe('12');
    expect(rowValue(container, 'Output tokens')).toBe('34');
    expect(rowValue(container, 'Cache-read tokens')).toBeNull();
    const labels = [...container.querySelectorAll('.inspector-row dt')].map((d) =>
      d.textContent.trim(),
    );
    expect(labels.slice(-3)).toEqual(['Total time', 'Input tokens', 'Output tokens']);
  });

  it('shows cache-read tokens, including a zero count', () => {
    const { container } = render(InspectorDrawer, {
      props: {
        meta: {
          backendId: asBackendIdUnsafe('anthropic'),
          cacheHit: false,
          latencyMs: 1,
          inputTokens: 0,
          cacheReadTokens: 900,
        },
        open: true,
        onClose: () => {},
      },
    });
    expect(rowValue(container, 'Input tokens')).toBe('0');
    expect(rowValue(container, 'Cache-read tokens')).toBe('900');
    expect(rowValue(container, 'Output tokens')).toBeNull();
  });
});
