import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Settings, BackendId } from '@/shared/types';
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
  backendIds?: readonly BackendId[];
  onPatchAdvanced?: Mock;
  onSetTaskBackendChain?: Mock;
}

/** LabsSection props: onPatchAdvanced and onSetTaskBackendChain instead of onPatch. */
export function makeLabsSectionProps(overrides: LabsSectionPropsOverrides = {}): {
  s: Settings;
  backendIds: readonly BackendId[];
  onPatchAdvanced: Mock;
  onSetTaskBackendChain: Mock;
} {
  const s = { ...DEFAULT_SETTINGS, ...overrides.s } as Settings;
  return {
    s,
    backendIds:
      overrides.backendIds ?? (['anthropic', 'openai'] as unknown as readonly BackendId[]),
    onPatchAdvanced: overrides.onPatchAdvanced ?? vi.fn(),
    onSetTaskBackendChain: overrides.onSetTaskBackendChain ?? vi.fn(),
  };
}

import type { SamplingSupport } from '@/shared/backends/sampling-caps';
import { ALL_TASKS, type Task } from '@/shared/task-prompts';

const FULL_CAPS: SamplingSupport = { temperature: true, maxTokens: true, reasoningEffort: false };

/** Every task on the same caps, the shape the tab produces when nothing is pinned elsewhere. */
export function sameCapsForEveryTask(caps: SamplingSupport): Record<Task, SamplingSupport> {
  return Object.fromEntries(ALL_TASKS.map((t) => [t, caps])) as Record<Task, SamplingSupport>;
}

export interface GenerationSectionPropsOverrides {
  s?: Partial<Settings>;
  caps?: SamplingSupport;
  taskCaps?: Record<Task, SamplingSupport>;
  onSetGlobalTemperature?: Mock;
  onSetGlobalMaxTokens?: Mock;
  onSetGlobalReasoningEffort?: Mock;
  onSetTaskTemperature?: Mock;
  onSetTaskMaxTokens?: Mock;
  onSetTaskReasoningEffort?: Mock;
}

/** GenerationSection props: caps and typed handlers, no onPatch. */
export function makeGenerationSectionProps(overrides: GenerationSectionPropsOverrides = {}): {
  s: Settings;
  caps: SamplingSupport;
  taskCaps: Record<Task, SamplingSupport>;
  onSetGlobalTemperature: Mock;
  onSetGlobalMaxTokens: Mock;
  onSetGlobalReasoningEffort: Mock;
  onSetTaskTemperature: Mock;
  onSetTaskMaxTokens: Mock;
  onSetTaskReasoningEffort: Mock;
} {
  const s = { ...DEFAULT_SETTINGS, ...overrides.s } as Settings;
  const caps = overrides.caps ?? FULL_CAPS;
  return {
    s,
    caps,
    taskCaps: overrides.taskCaps ?? sameCapsForEveryTask(caps),
    onSetGlobalTemperature: overrides.onSetGlobalTemperature ?? vi.fn(),
    onSetGlobalMaxTokens: overrides.onSetGlobalMaxTokens ?? vi.fn(),
    onSetGlobalReasoningEffort: overrides.onSetGlobalReasoningEffort ?? vi.fn(),
    onSetTaskTemperature: overrides.onSetTaskTemperature ?? vi.fn(),
    onSetTaskMaxTokens: overrides.onSetTaskMaxTokens ?? vi.fn(),
    onSetTaskReasoningEffort: overrides.onSetTaskReasoningEffort ?? vi.fn(),
  };
}
