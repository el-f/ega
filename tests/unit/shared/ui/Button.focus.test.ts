// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Button from '@/shared/ui/Button.svelte';

function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

const variants = ['primary', 'secondary', 'ghost', 'danger'] as const;

describe('Button data-variant attribute', () => {
  for (const variant of variants) {
    it(`renders data-variant="${variant}" on the button host`, () => {
      const { container } = render(Button, {
        props: { variant, children: textSnippet('Test') },
      });
      const btn = container.querySelector('button');
      expect(btn).toBeTruthy();
      expect(btn?.getAttribute('data-variant')).toBe(variant);
    });
  }
});
