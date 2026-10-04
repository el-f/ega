// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TemplateEditorCompiledPreview from '@/options/components/TemplateEditorCompiledPreview.svelte';

function setup(explain?: { checked: boolean; onChange: (next: boolean) => void }) {
  return render(TemplateEditorCompiledPreview, {
    props: {
      previewSys: 'SYSTEM BODY',
      previewUsr: 'USER BODY',
      sampleText: 'sample words',
      ...(explain ? { explain } : {}),
    },
  });
}

describe('TemplateEditorCompiledPreview', () => {
  it('shows the instructions, where history goes, and the message, in send order', () => {
    const { container } = setup();
    const labels = [...container.querySelectorAll('.preview-label')].map((l) => l.textContent);
    expect(labels).toEqual(['Instructions', 'Earlier messages', 'Message']);
    expect(container.querySelector('[data-ega-preview-system]')?.textContent).toBe('SYSTEM BODY');
    expect(container.querySelector('[data-ega-preview-user]')?.textContent).toBe('USER BODY');
    expect(container.querySelector('[data-ega-preview-history]')?.textContent).toContain(
      'Regenerate',
    );
    expect(container.textContent).toContain('sample words');
  });

  it('has no Explain switch unless the prompt also serves Explain', () => {
    const { container } = setup();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('the Explain switch reports its new state', async () => {
    const onChange = vi.fn();
    const { container } = setup({ checked: false, onChange });
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!box) throw new Error('no explain switch');
    await fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('scrolls into view when opened, and not when closed', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const { container } = setup();
    const details = container.querySelector<HTMLDetailsElement>('[data-ega-compile-preview]');
    if (!details) throw new Error('no preview');
    details.open = true;
    await fireEvent(details, new Event('toggle'));
    expect(scroll).toHaveBeenCalledTimes(1);
    details.open = false;
    await fireEvent(details, new Event('toggle'));
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
