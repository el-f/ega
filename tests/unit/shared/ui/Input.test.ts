// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent } from '@testing-library/svelte';
import Input from '@/shared/ui/Input.svelte';

describe('Input', () => {
  it('renders a text input by default', () => {
    const { getByRole } = render(Input, { props: { value: '' } });
    const el = getByRole('textbox') as HTMLInputElement;
    expect(el.type).toBe('text');
  });

  it('renders a labeled input', () => {
    const { getByText, getByLabelText } = render(Input, {
      props: { value: '', label: 'Your name' },
    });
    expect(getByText('Your name')).toBeTruthy();
    expect(getByLabelText('Your name')).toBeTruthy();
  });

  it('renders password type', () => {
    const { container } = render(Input, {
      props: { value: '', type: 'password', label: 'Password' },
    });
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('fires oninput', async () => {
    let captured = '';
    const { getByRole } = render(Input, {
      props: {
        value: '',
        oninput: (e: Event) => {
          captured = (e.target as HTMLInputElement).value;
        },
      },
    });
    await fireEvent.input(getByRole('textbox'), { target: { value: 'hello' } });
    expect(captured).toBe('hello');
  });

  it('sets aria-required when required prop is true', () => {
    const { getByRole } = render(Input, {
      props: { value: '', label: 'Name', required: true },
    });
    expect(getByRole('textbox').getAttribute('aria-required')).toBe('true');
  });

  it('omits aria-required when not required', () => {
    const { getByRole } = render(Input, { props: { value: '', label: 'Name' } });
    expect(getByRole('textbox').getAttribute('aria-required')).toBeNull();
  });

  it('reflects the value prop on the DOM input', async () => {
    const { getByRole } = render(Input, { props: { value: 'initial' } });
    const el = getByRole('textbox') as HTMLInputElement;
    expect(el.value).toBe('initial');
    await fireEvent.input(el, { target: { value: 'changed' } });
    expect(el.value).toBe('changed');
  });

  it('renders the disabled state', () => {
    const { getByRole } = render(Input, { props: { value: '', disabled: true } });
    const el = getByRole('textbox') as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });

  it('locks size-sm to a 28px min-height to match Button.size-sm baseline', () => {
    const sfcPath = resolve(process.cwd(), 'src/shared/ui/Input.svelte');
    const source = readFileSync(sfcPath, 'utf8');
    const sizeSmRule = source.match(/\.size-sm\s+\.ega-input\s*\{[^}]*\}/);
    expect(sizeSmRule, 'expected a .size-sm .ega-input rule in Input.svelte').not.toBeNull();
    if (!sizeSmRule) return;
    expect(sizeSmRule[0]).toMatch(/min-height:\s*28px/);
  });
});

describe('Input — clearable, aria-label', () => {
  it('renders the bound value', () => {
    const { getByRole } = render(Input, {
      props: { label: 'Name', value: 'foo' },
    });
    expect((getByRole('textbox') as HTMLInputElement).value).toBe('foo');
  });

  it('clearable shows a clear button that empties a non-empty value', async () => {
    const { getByLabelText, getByRole } = render(Input, {
      props: { label: 'Search', value: 'cats', clearable: true },
    });
    await fireEvent.click(getByLabelText(/clear/i));
    expect((getByRole('textbox') as HTMLInputElement).value).toBe('');
  });

  it('clearable hides the clear button when value is empty', () => {
    const { queryByLabelText } = render(Input, {
      props: { label: 'Search', value: '', clearable: true },
    });
    expect(queryByLabelText(/clear/i)).toBeNull();
  });

  it('disabled disables the input', () => {
    const { getByRole } = render(Input, {
      props: { label: 'X', value: 'x', disabled: true },
    });
    expect((getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('ariaLabel sets aria-label when no visible label is rendered', () => {
    const { getByRole } = render(Input, {
      props: { value: '', placeholder: 'Filter…', ariaLabel: 'Filter languages' },
    });
    expect(getByRole('textbox').getAttribute('aria-label')).toBe('Filter languages');
  });

  it('ariaLabel does not double up when a visible label exists', () => {
    const { getByRole } = render(Input, {
      props: { value: '', label: 'Name', ariaLabel: 'Name field' },
    });
    expect(getByRole('textbox').getAttribute('aria-label')).toBeNull();
  });

  it('required renders a marker in the visible label', () => {
    const { getByText } = render(Input, {
      props: { value: '', label: 'Label', required: true },
    });
    expect(getByText(/Label \*/)).toBeTruthy();
  });
});
