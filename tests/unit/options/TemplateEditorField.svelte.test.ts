// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import TemplateEditorField from '@/options/components/TemplateEditorField.svelte';

// tsc reads .svelte through a default-export shim, so the module's exported interface is not importable here.
interface TextareaApi {
  insertAtCursor: (text: string) => void;
  focus: () => void;
}

function setup(value: string) {
  let api: TextareaApi | undefined;
  const onValueChange = vi.fn();
  const { container } = render(TemplateEditorField, {
    props: {
      id: 'tpl-system',
      labelText: 'System',
      value,
      placeholder: 'System prompt',
      showReset: false,
      inheritedLabel: 'default',
      resetAriaLabel: 'Reset system prompt',
      wrapperDataAttr: 'data-ega-template-system',
      onValueChange,
      onFocus: vi.fn(),
      onReady: (a: TextareaApi) => (api = a),
      onReset: vi.fn(),
    },
  });
  const ta = container.querySelector('textarea');
  if (!ta || !api) throw new Error('textarea or api missing');
  return { ta, api, onValueChange };
}

describe('TemplateEditorField imperative handle', () => {
  it('inserts at the cursor, reports the new value and keeps focus', () => {
    const { ta, api, onValueChange } = setup('ab');
    ta.setSelectionRange(1, 1);
    api.insertAtCursor('{{text}}');
    expect(ta.value).toBe('a{{text}}b');
    expect(onValueChange).toHaveBeenLastCalledWith('a{{text}}b');
    expect(document.activeElement).toBe(ta);
  });

  it('replaces the selected range', () => {
    const { ta, api, onValueChange } = setup('hello world');
    ta.setSelectionRange(6, 11);
    api.insertAtCursor('{{text}}');
    expect(onValueChange).toHaveBeenLastCalledWith('hello {{text}}');
  });

  it('focus() focuses the textarea', () => {
    const { ta, api } = setup('');
    api.focus();
    expect(document.activeElement).toBe(ta);
  });
});
