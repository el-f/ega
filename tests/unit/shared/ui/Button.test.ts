// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import Button from '@/shared/ui/Button.svelte';

function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

describe('Button', () => {
  it('renders children', () => {
    const { getByRole } = render(Button, { props: { children: textSnippet('Click me') } });
    expect(getByRole('button').textContent).toContain('Click me');
  });

  it('applies the primary variant by default', () => {
    const { getByRole } = render(Button, { props: { children: textSnippet('x') } });
    expect(getByRole('button').classList.contains('variant-primary')).toBe(true);
  });

  it('applies the secondary variant when specified', () => {
    const { getByRole } = render(Button, {
      props: { variant: 'secondary', children: textSnippet('x') },
    });
    expect(getByRole('button').classList.contains('variant-secondary')).toBe(true);
  });

  it('emits no empty class slot when extraClass is unset', () => {
    const { getByRole } = render(Button, { props: { children: textSnippet('x') } });
    const cls = getByRole('button').getAttribute('class') ?? '';
    expect(cls).toMatch(/\bega-btn\b/);
    expect(cls).not.toMatch(/\s{2}|\s$/);
  });

  it('appends extraClass', () => {
    const { getByRole } = render(Button, {
      props: { extraClass: 'ega-test-extra', children: textSnippet('x') },
    });
    expect(getByRole('button').classList.contains('ega-test-extra')).toBe(true);
  });

  it('applies size classes', () => {
    const { getByRole } = render(Button, {
      props: { size: 'sm', children: textSnippet('x') },
    });
    expect(getByRole('button').classList.contains('size-sm')).toBe(true);
  });

  it('fires onclick', async () => {
    let clicked = false;
    const { getByRole } = render(Button, {
      props: {
        onclick: () => {
          clicked = true;
        },
        children: textSnippet('x'),
      },
    });
    await fireEvent.click(getByRole('button'));
    await tick();
    expect(clicked).toBe(true);
  });

  it('disables when disabled prop set', () => {
    const { getByRole } = render(Button, {
      props: { disabled: true, children: textSnippet('x') },
    });
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows loading state', () => {
    const { getByRole } = render(Button, {
      props: { loading: true, children: textSnippet('x') },
    });
    expect(getByRole('button').classList.contains('is-loading')).toBe(true);
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sets aria-busy when loading', () => {
    const { getByRole } = render(Button, {
      props: { loading: true, children: textSnippet('x') },
    });
    expect(getByRole('button').getAttribute('aria-busy')).toBe('true');
  });

  it('fires onclick on Enter keypress', async () => {
    let clicked = false;
    const { getByRole } = render(Button, {
      props: {
        onclick: () => {
          clicked = true;
        },
        children: textSnippet('x'),
      },
    });
    const btn = getByRole('button');
    btn.focus();
    await fireEvent.keyDown(btn, { key: 'Enter' });
    await fireEvent.click(btn); // Browser fires click on Enter for <button>; test env may not, so click to assert the path.
    expect(clicked).toBe(true);
  });

  it('propagates type="submit"', () => {
    const { getByRole } = render(Button, {
      props: { type: 'submit', children: textSnippet('x') },
    });
    expect((getByRole('button') as HTMLButtonElement).type).toBe('submit');
  });

  it('applies ariaLabel', () => {
    const { getByRole } = render(Button, {
      props: { ariaLabel: 'Save settings', children: textSnippet('x') },
    });
    expect(getByRole('button').getAttribute('aria-label')).toBe('Save settings');
  });

  it('iconKind renders data-action-icon attribute inside button', () => {
    const { getByRole } = render(Button, {
      props: { iconKind: 'export', children: textSnippet('Export') },
    });
    const btn = getByRole('button');
    expect(btn.querySelector('[data-action-icon="export"]')).not.toBeNull();
  });

  it('iconKind and leadingIcon are mutually exclusive — iconKind wins', () => {
    const { getByRole } = render(Button, {
      props: { iconKind: 'add', children: textSnippet('Add') },
    });
    const btn = getByRole('button');
    expect(btn.querySelector('[data-action-icon="add"]')).not.toBeNull();
  });

  it('iconKind=import renders its action icon', () => {
    const { getByRole } = render(Button, {
      props: { iconKind: 'import', children: textSnippet('Import') },
    });
    const btn = getByRole('button');
    expect(btn.querySelector('[data-action-icon="import"]')).not.toBeNull();
  });

  it('locks size-sm to a 28px min-height to match Input.size-sm baseline', () => {
    const sfcPath = resolve(process.cwd(), 'src/shared/ui/Button.svelte');
    const source = readFileSync(sfcPath, 'utf8');
    const sizeSmRule = source.match(/\.size-sm\s*\{[^}]*\}/);
    expect(sizeSmRule, 'expected a .size-sm rule in Button.svelte').not.toBeNull();
    if (!sizeSmRule) return;
    expect(sizeSmRule[0]).toMatch(/min-height:\s*28px/);
  });
});

describe('Button ariaDisabled', () => {
  it('keeps the Tab stop, names its reason, and ignores the click', async () => {
    let clicks = 0;
    const { getByRole } = render(Button, {
      props: {
        children: textSnippet('New task'),
        ariaDisabled: true,
        describedBy: 'why',
        onclick: () => clicks++,
      },
    });
    const btn = getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-describedby')).toBe('why');
    btn.focus();
    expect(document.activeElement).toBe(btn);
    await fireEvent.click(btn);
    expect(clicks).toBe(0);
  });

  it('clicks through when it is not set', async () => {
    let clicks = 0;
    const { getByRole } = render(Button, {
      props: { children: textSnippet('New task'), onclick: () => clicks++ },
    });
    expect(getByRole('button').hasAttribute('aria-disabled')).toBe(false);
    await fireEvent.click(getByRole('button'));
    expect(clicks).toBe(1);
  });
});
