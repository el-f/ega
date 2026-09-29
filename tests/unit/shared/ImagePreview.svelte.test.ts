// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ImagePreview from '@/shared/components/ImagePreview.svelte';

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

describe('ImagePreview.svelte', () => {
  it('renders an <img> with the given src + alt + lazy loading', () => {
    const { container } = render(ImagePreview, {
      props: { src: PIXEL_PNG, alt: 'test pixel' },
    });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(PIXEL_PNG);
    expect(img?.getAttribute('alt')).toBe('test pixel');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('starts collapsed (max-height set), expands on click', async () => {
    const { container } = render(ImagePreview, {
      props: { src: PIXEL_PNG },
    });
    const button = container.querySelector('button');
    if (!button) throw new Error('no toggle button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.maxHeight).toBe('120px');

    await fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(img.style.maxHeight).toBe('none');
  });

  it('default alt text is "Image preview" when none supplied', () => {
    const { container } = render(ImagePreview, { props: { src: PIXEL_PNG } });
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Image preview');
  });
});
