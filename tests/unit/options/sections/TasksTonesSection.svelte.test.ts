// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TasksTonesSection from '@/options/components/sections/TasksTonesSection.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { makeSectionProps, type OnPatch } from './_helpers';

describe('TasksTonesSection', () => {
  it('renders the task Select', () => {
    const { container } = render(TasksTonesSection, { props: makeSectionProps() });
    expect(container.querySelector('[data-ega-setting="defaults.defaultTask"]')).not.toBeNull();
  });

  it('hides defaultTone + override when defaultTask !== reword', () => {
    const { container } = render(TasksTonesSection, {
      props: makeSectionProps({ s: { defaultTask: 'translate' as const } }),
    });
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.taskTones"]')).toBeNull();
  });

  it('shows defaultTone + reword override when defaultTask === reword', () => {
    const { container } = render(TasksTonesSection, {
      props: makeSectionProps({ s: { defaultTask: 'reword' as const } }),
    });
    expect(container.querySelector('[data-ega-setting="defaults.defaultTone"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="advanced.taskTones"]')).not.toBeNull();
  });

  it('fires onPatch with taskTones nested patch on reword override change', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(TasksTonesSection, {
      props: makeSectionProps({ s: { defaultTask: 'reword' as const }, onPatch }),
    });
    const sel = container.querySelector<HTMLSelectElement>(
      '[data-ega-setting="advanced.taskTones"] select',
    );
    if (!sel) throw new Error('no reword override select');
    const newVal = Array.from(sel.options).find(
      (o) => o.value && !o.label.toLowerCase().includes('inherit'),
    )?.value;
    if (!newVal) throw new Error('no override choice');
    sel.value = newVal;
    await fireEvent.change(sel);
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        advanced: expect.objectContaining({ taskTones: { reword: newVal } }),
      }),
    );
  });

  it('clears reword override (delete key) when "(inherit default)" chosen', async () => {
    const onPatch = vi.fn<OnPatch>();
    const { container } = render(TasksTonesSection, {
      props: makeSectionProps({
        s: {
          defaultTask: 'reword' as const,
          advanced: { ...DEFAULT_SETTINGS.advanced, taskTones: { reword: 'formal' as const } },
        },
        onPatch,
      }),
    });
    const sel = container.querySelector<HTMLSelectElement>(
      '[data-ega-setting="advanced.taskTones"] select',
    );
    if (!sel) throw new Error('no reword override select');
    const inheritOpt = Array.from(sel.options).find((o) => o.label.includes('inherit'));
    if (!inheritOpt) throw new Error('no inherit option');
    sel.value = inheritOpt.value;
    await fireEvent.change(sel);
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ advanced: expect.objectContaining({ taskTones: {} }) }),
    );
  });

  it('inherit option uses a non-empty sentinel value (no "blank" announce)', () => {
    const { container } = render(TasksTonesSection, {
      props: makeSectionProps({ s: { defaultTask: 'reword' as const } }),
    });
    const sel = container.querySelector<HTMLSelectElement>(
      '[data-ega-setting="advanced.taskTones"] select',
    );
    if (!sel) throw new Error('no reword override select');
    const inheritOpt = Array.from(sel.options).find((o) => o.label.includes('inherit'));
    expect(inheritOpt).toBeTruthy();
    expect(inheritOpt?.value).not.toBe('');
    expect(inheritOpt?.value.length).toBeGreaterThan(0);
  });
});
