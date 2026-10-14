import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

/** The onPatch prop every settings section takes. */
export type OnPatch = (p: Partial<Settings>) => Promise<void> | void;

export interface SectionPropsOverrides {
  s?: Partial<Settings>;
  onPatch?: Mock<OnPatch>;
}

/** { s, onPatch } props for section tests; s defaults to DEFAULT_SETTINGS. */
export function makeSectionProps(overrides: SectionPropsOverrides = {}): {
  s: Settings;
  onPatch: Mock<OnPatch>;
} {
  const s = { ...DEFAULT_SETTINGS, ...overrides.s } as Settings;
  const onPatch = overrides.onPatch ?? vi.fn<OnPatch>();
  return { s, onPatch };
}

/** The card reset callback the cards with a "Reset section" pill take. */
export type OnResetCard = (title: string, defaults: Partial<Settings>) => Promise<void>;

/** makeSectionProps plus the card reset callback. */
export function makeResetSectionProps(
  overrides: SectionPropsOverrides & { onResetCard?: Mock<OnResetCard> } = {},
): { s: Settings; onPatch: Mock<OnPatch>; onResetCard: Mock<OnResetCard> } {
  return {
    ...makeSectionProps(overrides),
    onResetCard: overrides.onResetCard ?? vi.fn<OnResetCard>(async () => {}),
  };
}

import type { GenerationNotes } from '@/options/generation-notes';

const NO_NOTES: GenerationNotes = { effort: [], maxTokens: [], temperature: [] };

export interface GenerationSectionPropsOverrides {
  s?: Partial<Settings>;
  notes?: GenerationNotes;
  onSetGlobalTemperature?: Mock;
  onSetGlobalMaxTokens?: Mock;
  onSetGlobalEffort?: Mock;
  onResetCard?: Mock<OnResetCard>;
}

/** GenerationSection props: note lines and typed handlers, no onPatch. */
export function makeGenerationSectionProps(overrides: GenerationSectionPropsOverrides = {}): {
  s: Settings;
  notes: GenerationNotes;
  onSetGlobalTemperature: Mock;
  onSetGlobalMaxTokens: Mock;
  onSetGlobalEffort: Mock;
  onResetCard: Mock<OnResetCard>;
} {
  const s = { ...DEFAULT_SETTINGS, ...overrides.s } as Settings;
  return {
    s,
    notes: overrides.notes ?? NO_NOTES,
    onSetGlobalTemperature: overrides.onSetGlobalTemperature ?? vi.fn(),
    onSetGlobalMaxTokens: overrides.onSetGlobalMaxTokens ?? vi.fn(),
    onSetGlobalEffort: overrides.onSetGlobalEffort ?? vi.fn(),
    onResetCard: overrides.onResetCard ?? vi.fn<OnResetCard>(async () => {}),
  };
}
