// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { BUILT_IN_PRESETS } from '@/shared/presets';
import {
  VARIETY_EXAMPLE_MAX,
  VARIETY_EXAMPLES_MAX,
  VARIETY_HINT_MAX,
} from '@/shared/settings-schema';
import { toastStore } from '@/shared/components/toastStore';

const LanguagesModule = await import('@/options/tabs/Languages.svelte');
const Languages = LanguagesModule.default;

/** Seeds one built-in with `count` saved examples so the editor opens on a full list. */
function seedExamples(count: number): void {
  const preset = BUILT_IN_PRESETS[0];
  if (!preset) throw new Error('no built-in presets');
  chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
    ...DEFAULT_SETTINGS,
    varietyOverrides: {
      [preset.id as string]: {
        hint: 'seeded',
        examples: Array.from({ length: count }, (_, i) => ({ src: `s${i}`, tgt: `t${i}` })),
      },
    },
  });
}

async function openFirstEditor(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelectorAll('.variety-row').length).toBeGreaterThan(0);
  });
  const editBtn = await waitFor(() => {
    const btn = document.querySelector<HTMLButtonElement>(
      '.variety-actions button[aria-label="Edit"]',
    );
    if (!btn) throw new Error('edit button not found');
    return btn;
  });
  await fireEvent.click(editBtn);
  await waitFor(() => {
    expect(document.querySelector('.variety-commit-row')).not.toBeNull();
  });
}

function addExampleButton(): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>('.variety-add-example-row button');
  if (!btn) throw new Error('add-example button not found');
  return btn;
}

describe('Languages tab — writer caps', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
  });

  it('caps the hint and example fields at the stored maximum', async () => {
    seedExamples(1);
    render(Languages);
    await openFirstEditor();

    const hint = document.querySelector('textarea[id^="hint-"]');
    expect(hint?.getAttribute('maxlength')).toBe(String(VARIETY_HINT_MAX));

    const example = document.querySelector('.variety-example-row input');
    expect(example?.getAttribute('maxlength')).toBe(String(VARIETY_EXAMPLE_MAX));
  });

  it('refuses another example past the cap and says why', async () => {
    seedExamples(VARIETY_EXAMPLES_MAX);
    const pushed: string[] = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m.message);
    });
    render(Languages);
    await openFirstEditor();

    expect(document.querySelectorAll('.variety-example-row')).toHaveLength(VARIETY_EXAMPLES_MAX);
    await fireEvent.click(addExampleButton());

    expect(document.querySelectorAll('.variety-example-row')).toHaveLength(VARIETY_EXAMPLES_MAX);
    expect(pushed[0]).toMatch(String(VARIETY_EXAMPLES_MAX));
  });

  it('still adds an example below the cap', async () => {
    seedExamples(2);
    render(Languages);
    await openFirstEditor();

    await fireEvent.click(addExampleButton());

    expect(document.querySelectorAll('.variety-example-row')).toHaveLength(3);
  });
});
