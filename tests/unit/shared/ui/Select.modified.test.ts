// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Select from '@/shared/ui/Select.svelte';

const OPTS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
] as const;

describe('Select modified prop', () => {
  it('renders modified dot when modified=true', () => {
    const { container } = render(Select, {
      props: { value: 'a', options: OPTS, label: 'Test', modified: true },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeTruthy();
  });

  it('does not render modified dot when modified=false', () => {
    const { container } = render(Select, {
      props: { value: 'a', options: OPTS, label: 'Test', modified: false },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });

  it('does not render modified dot when modified is unset', () => {
    const { container } = render(Select, {
      props: { value: 'a', options: OPTS, label: 'Test' },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });
});
