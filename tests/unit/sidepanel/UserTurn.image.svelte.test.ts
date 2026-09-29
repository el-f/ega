// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const mkTurn = (overrides: Partial<Turn> = {}): Turn => ({
  id: 'u1',
  role: 'user',
  kind: 'translate',
  status: 'idle',
  createdAt: 1,
  content: 'hola',
  ...overrides,
});

describe('UserTurn — an image message cannot be edited as text', () => {
  it('hides the pencil on an image turn', () => {
    const { container } = render(UserTurn, {
      props: {
        turn: mkTurn({ kind: 'image-translate', content: '[image]', imageDataUrl: PIXEL }),
        onEdit: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-edit]')).toBeNull();
  });

  it('hides the pencil on an Explain turn that carries an image', () => {
    // The guard keys on the image, not the kind: an Explain send carries one too.
    const { container } = render(UserTurn, {
      props: {
        turn: mkTurn({ kind: 'explain', content: 'what is this sign', imageDataUrl: PIXEL }),
        onEdit: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-edit]')).toBeNull();
  });

  it('keeps the pencil on a text turn', () => {
    const { container } = render(UserTurn, {
      props: { turn: mkTurn(), onEdit: vi.fn() },
    });
    expect(container.querySelector('[data-ega-edit]')).not.toBeNull();
  });
});

describe('UserTurn — an image the guard stripped still says so', () => {
  it('shows a placeholder when the image is gone', () => {
    const { container } = render(UserTurn, {
      props: { turn: mkTurn({ kind: 'image-translate', content: '[image]' }) },
    });
    expect(container.querySelector('.ega-user-image-missing')?.textContent).toBe('Image not shown');
  });

  it('shows the image itself when it survived', () => {
    const { container } = render(UserTurn, {
      props: {
        turn: mkTurn({ kind: 'image-translate', content: '[image]', imageDataUrl: PIXEL }),
      },
    });
    expect(container.querySelector('.ega-user-image-missing')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
