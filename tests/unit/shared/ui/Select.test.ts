// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Select from '@/shared/ui/Select.svelte';

describe('Select', () => {
  it('renders options', () => {
    const { getAllByRole } = render(Select, {
      props: {
        value: 'a',
        label: 'Pick',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
      },
    });
    expect(getAllByRole('option')).toHaveLength(2);
  });

  it('reflects the selected value', () => {
    const { container } = render(Select, {
      props: {
        value: 'b',
        label: 'Pick',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
      },
    });
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('b');
  });

  it('fires onchange with new value', async () => {
    let captured = '';
    const { container } = render(Select, {
      props: {
        value: 'a',
        label: 'Pick',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
        onchange: (v: string) => {
          captured = v;
        },
      },
    });
    const sel = container.querySelector('select') as HTMLSelectElement;
    await fireEvent.change(sel, { target: { value: 'b' } });
    expect(captured).toBe('b');
  });

  it('passes the native change event as the second onchange argument', async () => {
    let captured: Event | undefined;
    const { container } = render(Select, {
      props: {
        value: 'a',
        label: 'Pick',
        options: [
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana' },
        ],
        onchange: (_v: string, e: Event) => {
          captured = e;
        },
      },
    });
    const sel = container.querySelector('select') as HTMLSelectElement;
    await fireEvent.change(sel, { target: { value: 'b' } });
    expect(captured?.type).toBe('change');
    expect(captured?.target).toBe(sel);
  });
});
