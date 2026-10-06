// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
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

describe('Checkbox "Changed" marker and aria-disabled', () => {
  it('shows the word Changed, read as the description, not as part of the name', () => {
    const { getByRole, getByText } = render(Checkbox, {
      props: { checked: true, label: 'Show confidence pill', modified: true },
    });
    const box = getByRole('checkbox', { name: 'Show confidence pill' });
    const marker = getByText('Changed');
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain(marker.id);
  });

  it('an aria-disabled box keeps its Tab stop, names its reason and does not toggle', async () => {
    const onchange = vi.fn();
    const { getByRole } = render(Checkbox, {
      props: {
        checked: true,
        label: 'Translate',
        ariaDisabled: true,
        describedBy: 'why',
        onchange,
      },
    });
    const box = getByRole('checkbox', { name: 'Translate' }) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(box.getAttribute('aria-describedby')).toBe('why');
    await fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(onchange).not.toHaveBeenCalled();
  });
});
