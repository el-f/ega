// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TaskPicker from '@/shared/components/TaskPicker.svelte';

describe('TaskPicker — wrap prop', () => {
  it('default render: segmented row wraps (flex-wrap: wrap)', () => {
    const { container } = render(TaskPicker, {
      props: {
        task: 'translate',
      },
    });
    const row = container.querySelector<HTMLElement>('.row');
    expect(row).not.toBeNull();
    expect(row?.classList.contains('nowrap')).toBe(false);
  });

  it('wrap={false} adds .nowrap so chips stay on a single row', () => {
    const { container } = render(TaskPicker, {
      props: {
        task: 'translate',
        wrap: false,
      },
    });
    const row = container.querySelector<HTMLElement>('.row');
    expect(row?.classList.contains('nowrap')).toBe(true);
  });
});
