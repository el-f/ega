// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import WorkbenchPerPresetPanel from '@/options/components/templates-pane/WorkbenchPerPresetPanel.svelte';
import { parseSettings } from '@/shared/settings-schema';
import { resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import { makeMockHandlers } from './_mock-templates-handlers';

function baseProps(overrides: Record<string, unknown> = {}) {
  const s = parseSettings({});
  return {
    s,
    TemplateEditorCmp: null,
    handlers: makeMockHandlers(),
    ...overrides,
  };
}

describe('WorkbenchPerPresetPanel', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.clearAllMocks();
  });

  it('shows translate-and-explain-only clarification in the description', () => {
    const { container } = render(WorkbenchPerPresetPanel, { props: baseProps() });
    const desc = container.querySelector('.chip-desc');
    expect(desc?.textContent).toContain('Translate and Explain only');
  });

  it('dropdown shows built-ins on mount', async () => {
    const { container } = render(WorkbenchPerPresetPanel, { props: baseProps() });
    const select = container.querySelector('select');
    await waitFor(() => {
      const options = select?.querySelectorAll('option:not([value=""])') ?? [];
      expect(options.length).toBeGreaterThan(0);
    });
  });

  it('dropdown includes custom variety with (custom) badge when present', async () => {
    const custom = {
      id: 'custom-uuid-1',
      label: 'My Team Slang',
      hint: 'internal speak',
      examples: [],
      createdAt: 1000,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.customLanguages]: [custom] });

    const { container } = render(WorkbenchPerPresetPanel, { props: baseProps() });
    const select = container.querySelector('select');
    await waitFor(() => {
      const options = select ? Array.from(select.querySelectorAll('option')) : [];
      const texts = options.map((o) => String(o.textContent));
      expect(texts.some((t) => t.includes('My Team Slang') && t.includes('(custom)'))).toBe(true);
    });
  });

  it('custom varieties appear in a dedicated optgroup', async () => {
    const custom = {
      id: 'custom-uuid-2',
      label: 'Pirate Speak',
      hint: 'arr matey',
      examples: [],
      createdAt: 1000,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.customLanguages]: [custom] });

    const { container } = render(WorkbenchPerPresetPanel, { props: baseProps() });
    await waitFor(() => {
      const optgroup = container.querySelector('optgroup[label="Custom"]');
      expect(optgroup).not.toBeNull();
    });
  });

  it('selecting a preset shows loading editor placeholder (TemplateEditorCmp=null)', async () => {
    const preset = BUILT_IN_PRESETS[0];
    if (!preset) return;

    const { container } = render(WorkbenchPerPresetPanel, { props: baseProps() });
    const select = container.querySelector<HTMLSelectElement>('select');
    await waitFor(() => {
      const opts = select?.querySelectorAll('option:not([value=""])') ?? [];
      expect(opts.length).toBeGreaterThan(0);
    });
    if (!select) throw new Error('select not found');
    await fireEvent.change(select, { target: { value: preset.id } });

    await waitFor(() => {
      const placeholder = container.querySelector('.lazy-loading');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toMatch(/loading editor/i);
    });
  });

  it('existing-override count hint updates when settings have perPresetTemplates', async () => {
    const preset = BUILT_IN_PRESETS[0];
    if (!preset) return;

    const s = parseSettings({});
    const sWithOverride = {
      ...s,
      advanced: {
        ...s.advanced,
        perPresetTemplates: {
          [preset.id]: { system: 'custom sys', user: 'custom user' },
        },
      },
    };

    const { container } = render(WorkbenchPerPresetPanel, {
      props: baseProps({ s: sWithOverride }),
    });

    // The empty state should mention "1 language already overridden".
    await waitFor(() => {
      const body = container.querySelector('.per-preset-empty-body');
      const text = (body?.textContent ?? '').replace(/\s+/g, ' ').trim();
      expect(text).toMatch(/1 language.* already overridden/i);
    });
  });
});
