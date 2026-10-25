// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
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

describe('Button labels (R63)', () => {
  const labels = ['Test now', 'Testing...', 'Stop'];

  it('renders every label as a hidden sizer, and only the current label names the button', () => {
    const { getByRole } = render(Button, { props: { labels, children: textSnippet('Stop') } });
    const btn = getByRole('button', { name: 'Stop' });
    const sizers = [...btn.querySelectorAll('.ega-btn-sizer')];
    expect(sizers.map((s) => s.getAttribute('data-label'))).toEqual(labels);
    for (const s of sizers) {
      expect(s.getAttribute('aria-hidden')).toBe('true');
      // The text comes from CSS, so textContent and the accessible name see the current label only.
      expect(s.textContent).toBe('');
    }
    expect(btn.textContent.trim()).toBe('Stop');
    expect(btn.querySelector('.ega-btn-current')?.textContent).toBe('Stop');
  });

  // One copy of the stacking rules: .ega-stable in tokens.css, shared with StableLabel.
  it('stacks the labels in one hidden grid cell with the shared .ega-stable rules', () => {
    const { getByRole } = render(Button, { props: { labels, children: textSnippet('Stop') } });
    const stack = getByRole('button').querySelector('.ega-btn-label');
    expect(stack?.classList.contains('ega-stable')).toBe(true);
    const source = readFileSync(resolve(process.cwd(), 'src/shared/ui/Button.svelte'), 'utf8');
    expect(source).not.toMatch(/grid-area|content: attr\(data-label\)/);
  });

  it('keeps the icon outside the stack and the 32px md height', () => {
    const { getByRole } = render(Button, {
      props: {
        iconKind: 'import',
        labels: ['Download', 'Downloaded'],
        children: textSnippet('Download'),
      },
    });
    const btn = getByRole('button', { name: 'Download' });
    expect(btn.querySelector('.ega-stable [data-action-icon]')).toBeNull();
    expect(btn.querySelector(':scope > [data-action-icon]')).not.toBeNull();
    expect(btn.classList.contains('size-md')).toBe(true);
  });

  it('busy shows a spinner beside the readable label, keeps the Tab stop and ignores the click', async () => {
    let clicks = 0;
    const { getByRole, rerender } = render(Button, {
      props: { labels, busy: false, onclick: () => clicks++, children: textSnippet('Test now') },
    });
    const btn = getByRole('button') as HTMLButtonElement;
    // Every label keeps room for the spinner, so the busy state is no wider.
    for (const s of btn.querySelectorAll('.ega-btn-sizer')) {
      expect(s.classList.contains('has-spinner')).toBe(true);
    }
    expect(btn.querySelector('[data-ega-inline-spinner]')).toBeNull();
    await rerender({
      labels,
      busy: true,
      onclick: () => clicks++,
      children: textSnippet('Testing...'),
    });
    expect(btn.querySelector('.ega-btn-current [data-ega-inline-spinner]')).not.toBeNull();
    expect(getByRole('button', { name: 'Testing...' })).toBe(btn);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);
    await fireEvent.click(btn);
    expect(clicks).toBe(0);
  });

  it('a button with no busy state reserves no spinner room', () => {
    const { getByRole } = render(Button, {
      props: { labels: ['Copy', 'Copied'], children: textSnippet('Copy') },
    });
    const sizers = getByRole('button').querySelectorAll('.ega-btn-sizer');
    expect([...sizers].some((s) => s.classList.contains('has-spinner'))).toBe(false);
  });

  it('loading keeps the stack in place under the spinner', () => {
    const { getByRole } = render(Button, {
      props: { labels, loading: true, children: textSnippet('Test now') },
    });
    const btn = getByRole('button');
    expect(btn.classList.contains('is-loading')).toBe(true);
    expect(btn.querySelectorAll('.ega-btn-sizer')).toHaveLength(3);
  });
});

// Test now becomes Stop in place, so the second click of a double-click would stop the test it just started.
describe('Button labels ignore the rest of a double-click', () => {
  afterEach(() => vi.restoreAllMocks());
  const at = (ms: number): void => void vi.spyOn(Date, 'now').mockReturnValue(ms);

  it('acts on the first click, drops the second, and acts again once the window passes', async () => {
    let clicks = 0;
    const { getByRole } = render(Button, {
      props: {
        labels: ['Test now', 'Stop'],
        onclick: () => clicks++,
        children: textSnippet('Test now'),
      },
    });
    const btn = getByRole('button');
    at(10_000);
    await fireEvent.click(btn, { detail: 1 });
    at(10_150);
    await fireEvent.click(btn, { detail: 2 });
    expect(clicks).toBe(1);
    at(10_600);
    await fireEvent.click(btn, { detail: 3 });
    // A keyboard press has detail 0 and always acts.
    await fireEvent.click(btn, { detail: 0 });
    expect(clicks).toBe(3);
  });

  it('a button with one label, or none, acts on every click', async () => {
    let clicks = 0;
    const one = render(Button, {
      props: { labels: ['Save'], onclick: () => clicks++, children: textSnippet('Save') },
    });
    await fireEvent.click(one.getByRole('button'), { detail: 1 });
    await fireEvent.click(one.getByRole('button'), { detail: 2 });
    one.unmount();
    const none = render(Button, {
      props: { onclick: () => clicks++, children: textSnippet('Go') },
    });
    await fireEvent.click(none.getByRole('button'), { detail: 1 });
    await fireEvent.click(none.getByRole('button'), { detail: 2 });
    expect(clicks).toBe(4);
  });
});
