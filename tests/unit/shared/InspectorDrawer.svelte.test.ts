// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InspectorDrawer from '@/shared/components/InspectorDrawer.svelte';
import type { ResultMeta } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

function baseMeta(overrides: Partial<ResultMeta> = {}): ResultMeta {
  return {
    backendId: asBackendIdUnsafe('anthropic'),
    cacheHit: false,
    latencyMs: 450,
    ...overrides,
  };
}

describe('InspectorDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(InspectorDrawer, {
      props: { meta: baseMeta(), open: false, onClose: () => {} },
    });
    expect(container.querySelector('[data-ega-inspector]')).toBeNull();
  });

  it('renders backend / total-time rows when open', () => {
    const { getByText } = render(InspectorDrawer, {
      props: { meta: baseMeta(), open: true, onClose: () => {} },
    });
    expect(getByText('Backend')).toBeTruthy();
    // The drawer resolves the id to the manifest name, the way the backend chip does.
    expect(getByText('Anthropic')).toBeTruthy();
    expect(getByText('Total time')).toBeTruthy();
    expect(getByText('450 ms')).toBeTruthy();
  });

  it('hides the Cache row on a miss (the normal state — not user-relevant)', () => {
    const { queryByText } = render(InspectorDrawer, {
      props: { meta: baseMeta({ cacheHit: false }), open: true, onClose: () => {} },
    });
    expect(queryByText('Cache')).toBeNull();
    expect(queryByText('Miss')).toBeNull();
  });

  it('shows Cache: Hit only when the request was served from cache', () => {
    const { getByText } = render(InspectorDrawer, {
      props: { meta: baseMeta({ cacheHit: true }), open: true, onClose: () => {} },
    });
    expect(getByText('Cache')).toBeTruthy();
    expect(getByText('Hit')).toBeTruthy();
  });

  it('renders model and direction rows when meta carries them', () => {
    const { getByText } = render(InspectorDrawer, {
      props: {
        meta: baseMeta({
          modelId: 'claude-test',
          sourceLang: 'auto',
          targetLang: 'en',
        }),
        open: true,
        onClose: () => {},
      },
    });
    expect(getByText('Model')).toBeTruthy();
    expect(getByText('claude-test')).toBeTruthy();
    expect(getByText('Direction')).toBeTruthy();
    expect(getByText('Auto-detect → English')).toBeTruthy();
  });

  it('omits first-token row when firstTokenMs is absent', () => {
    const { queryByText } = render(InspectorDrawer, {
      props: { meta: baseMeta(), open: true, onClose: () => {} },
    });
    expect(queryByText('First token')).toBeNull();
  });

  it('includes first-token row when present', () => {
    const { getByText } = render(InspectorDrawer, {
      props: {
        meta: baseMeta({ firstTokenMs: 120 }),
        open: true,
        onClose: () => {},
      },
    });
    expect(getByText('First token')).toBeTruthy();
    expect(getByText('120 ms')).toBeTruthy();
  });

  it('formats latency above 1s as seconds', () => {
    const { getByText } = render(InspectorDrawer, {
      props: {
        meta: baseMeta({ latencyMs: 2345 }),
        open: true,
        onClose: () => {},
      },
    });
    expect(getByText('2.35 s')).toBeTruthy();
  });

  it('close button invokes onClose', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(InspectorDrawer, {
      props: { meta: baseMeta(), open: true, onClose },
    });
    await fireEvent.click(getByLabelText('Close details'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render copy controls', () => {
    const { queryByRole } = render(InspectorDrawer, {
      props: { meta: baseMeta(), open: true, onClose: () => {} },
    });
    expect(queryByRole('button', { name: /copy/i })).toBeNull();
  });
});
