// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import RadioGroup from '@/shared/ui/RadioGroup.svelte';

const sample = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry', description: 'Red and tart' },
];

describe('RadioGroup', () => {
  it('renders all options with their labels', () => {
    const { getAllByRole, getByText } = render(RadioGroup, {
      props: {
        value: 'a',
        options: sample,
        onValueChange: () => {},
      },
    });
    const items = getAllByRole('radio');
    expect(items).toHaveLength(3);
    expect(getByText('Apple')).toBeTruthy();
    expect(getByText('Banana')).toBeTruthy();
    expect(getByText('Cherry')).toBeTruthy();
    expect(getByText('Red and tart')).toBeTruthy();
  });

  it('marks only the selected item as checked', () => {
    const { getAllByRole } = render(RadioGroup, {
      props: {
        value: 'b',
        options: sample,
        onValueChange: () => {},
      },
    });
    const items = getAllByRole('radio');
    expect(items[0]?.getAttribute('data-state')).toBe('unchecked');
    expect(items[1]?.getAttribute('data-state')).toBe('checked');
    expect(items[2]?.getAttribute('data-state')).toBe('unchecked');
    expect(items[1]?.getAttribute('aria-checked')).toBe('true');
  });

  it('fires onValueChange with the new value when an option is clicked', async () => {
    let captured = '';
    const { getAllByRole } = render(RadioGroup, {
      props: {
        value: 'a',
        options: sample,
        onValueChange: (next: string) => {
          captured = next;
        },
      },
    });
    const items = getAllByRole('radio');
    await fireEvent.click(items[2] as HTMLElement);
    expect(captured).toBe('c');
  });

  it('forwards dataAttrs to the root element', () => {
    const { container } = render(RadioGroup, {
      props: {
        value: 'a',
        options: sample,
        onValueChange: () => {},
        dataAttrs: { 'data-ega-test': 'context-level', 'data-ega-count': 3 },
      },
    });
    const root = container.querySelector('[data-ega-test="context-level"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-ega-count')).toBe('3');
  });
});
