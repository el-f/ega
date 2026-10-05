// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import TemplateEditorActions from '@/options/components/TemplateEditorActions.svelte';

function baseProps(over: Record<string, unknown> = {}) {
  return {
    dirty: false,
    canReset: false,
    saveErr: null as string | null,
    saveOk: null as string | null,
    inheritedLabel: 'Reset to default',
    saveLabel: 'Save',
    onSave: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
}

describe('TemplateEditorActions', () => {
  it('disables the reset button when canReset is false (at default)', () => {
    const { container } = render(TemplateEditorActions, { props: baseProps() });
    const reset = container.querySelector('[data-ega-template-reset]') as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
  });

  it('enables the reset button when canReset is true', () => {
    const { container } = render(TemplateEditorActions, {
      props: baseProps({ canReset: true }),
    });
    const reset = container.querySelector('[data-ega-template-reset]') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
  });

  it('gates Save on dirty independently of canReset', () => {
    const { container } = render(TemplateEditorActions, {
      props: baseProps({ dirty: false, canReset: true }),
    });
    const save = container.querySelector('[data-ega-template-save]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
