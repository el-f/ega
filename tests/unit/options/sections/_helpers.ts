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

export interface LabsSectionPropsOverrides {
  s?: Partial<Settings>;
  onPatchAdvanced?: Mock;
}

/** LabsSection props: onPatchAdvanced instead of onPatch. */
export function makeLabsSectionProps(overrides: LabsSectionPropsOverrides = {}): {
  s: Settings;
  onPatchAdvanced: Mock;
} {
  const s = { ...DEFAULT_SETTINGS, ...overrides.s } as Settings;
  return {
    s,
    onPatchAdvanced: overrides.onPatchAdvanced ?? vi.fn(),
  };
}

import type { SamplingSupport } from '@/shared/backends/sampling-caps';

const FULL_CAPS: SamplingSupport = { temperature: true, maxTokens: true, efforts: [] };

export interface GenerationSectionPropsOverrides {
  s?: Partial<Settings>;
  caps?: SamplingSupport;
  activeBackend?: string;
  activeModel?: string;
  onSetGlobalTemperature?: Mock;
  onSetGlobalMaxTokens?: Mock;
  onSetGlobalEffort?: Mock;
}

/** GenerationSection props: caps and typed handlers, no onPatch. */
export function makeGenerationSectionProps(overrides: GenerationSectionPropsOverrides = {}): {
  s: Settings;
  caps: SamplingSupport;
  activeBackend: string;
  activeModel: string;
  onSetGlobalTemperature: Mock;
  onSetGlobalMaxTokens: Mock;
  onSetGlobalEffort: Mock;
} {
  const s = { ...DEFAULT_SETTINGS, ...overrides.s } as Settings;
  return {
    s,
    caps: overrides.caps ?? FULL_CAPS,
    activeBackend: overrides.activeBackend ?? 'anthropic',
    activeModel: overrides.activeModel ?? 'claude-test',
    onSetGlobalTemperature: overrides.onSetGlobalTemperature ?? vi.fn(),
    onSetGlobalMaxTokens: overrides.onSetGlobalMaxTokens ?? vi.fn(),
    onSetGlobalEffort: overrides.onSetGlobalEffort ?? vi.fn(),
  };
}
