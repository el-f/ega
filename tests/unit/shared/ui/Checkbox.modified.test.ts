// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Checkbox from '@/shared/ui/Checkbox.svelte';

describe('Checkbox modified prop', () => {
  it('renders modified dot when modified=true', () => {
    const { container } = render(Checkbox, {
      props: { checked: false, label: 'Test', modified: true },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeTruthy();
  });

  it('does not render modified dot when modified=false', () => {
    const { container } = render(Checkbox, {
      props: { checked: false, label: 'Test', modified: false },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });

  it('does not render modified dot when modified is unset', () => {
    const { container } = render(Checkbox, {
      props: { checked: false, label: 'Test' },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });
});
