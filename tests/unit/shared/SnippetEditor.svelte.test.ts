// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SnippetEditor from '@/options/components/SnippetEditor.svelte';

function baseProps(over: Partial<Parameters<typeof render>[1]> = {}) {
  return {
    snippets: {} as Record<string, string>,
    onChange: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('SnippetEditor', () => {
  it('shows empty state when there are no snippets', () => {
    const { container } = render(SnippetEditor, { props: baseProps() });
    expect(container.textContent).toContain('No snippets yet');
  });

  it('renders one row per snippet, sorted by name', () => {
    const { container } = render(SnippetEditor, {
      props: baseProps({ snippets: { zebra: 'z', alpha: 'a', mid: 'm' } }),
    });
    const rows = Array.from(container.querySelectorAll('[data-ega-snippet-row]')) as HTMLElement[];
    const names = rows.map((r) => r.getAttribute('data-ega-snippet-name'));
    expect(names).toEqual(['alpha', 'mid', 'zebra']);
  });

  it('+ New snippet adds an auto-named entry to onChange payload', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(SnippetEditor, {
      props: baseProps({ snippets: { snippet1: 'x' }, onChange }),
    });
    await fireEvent.click(getByText('+ New snippet'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Record<string, string>;
    expect(next).toEqual({ snippet1: 'x', snippet2: '' });
  });

  it('typing into the body textarea forwards capped value via onChange', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SnippetEditor, {
      props: baseProps({ snippets: { greet: 'hi' }, onChange }),
    });
    const ta = container.querySelector('[data-ega-snippet-body]') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: 'hello world' } });
    expect(onChange).toHaveBeenCalledWith({ greet: 'hello world' });
  });

  it('rename dialog rejects invalid characters', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { getByText, container } = render(SnippetEditor, {
      props: baseProps({ snippets: { greet: 'hi' }, onChange }),
    });
    await fireEvent.click(getByText('Edit name'));
    const input = container.querySelector('[data-ega-snippet-rename-input]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'has space' } });
    await fireEvent.click(getByText('Rename'));
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Use only letters, digits and underscores.');
  });

  it('rename dialog rewrites the snippets map under a new key, preserving body', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { getByText, container } = render(SnippetEditor, {
      props: baseProps({ snippets: { greet: 'hello' }, onChange }),
    });
    await fireEvent.click(getByText('Edit name'));
    const input = container.querySelector('[data-ega-snippet-rename-input]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'hi_there' } });
    await fireEvent.click(getByText('Rename'));
    expect(onChange).toHaveBeenCalledWith({ hi_there: 'hello' });
  });
});
