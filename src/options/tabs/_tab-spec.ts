import type { Component } from 'svelte';
import Languages from '@lucide/svelte/icons/languages';
import MousePointerSquareDashed from '@lucide/svelte/icons/mouse-pointer-square-dashed';
import Server from '@lucide/svelte/icons/server';
import BookA from '@lucide/svelte/icons/book-a';
import BookMarked from '@lucide/svelte/icons/book-marked';
import FileCode from '@lucide/svelte/icons/file-code';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import Info from '@lucide/svelte/icons/info';
import { SETTINGS_TABS, type SettingsTab } from '@/shared/settings-tabs';

type LucideLike = Component<{
  size?: number | string;
  strokeWidth?: number | string;
  class?: string;
}>;

export interface TabSpec {
  readonly id: SettingsTab;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideLike;
}

// The only per-tab thing the options bundle owns; ids, labels and copy come from shared.
const ICONS: Record<SettingsTab, LucideLike> = {
  translate: Languages,
  'selection-bubble': MousePointerSquareDashed,
  backends: Server,
  languages: BookA,
  templates: FileCode,
  glossary: BookMarked,
  advanced: SlidersHorizontal,
  about: Info,
};

export const TABS: readonly TabSpec[] = SETTINGS_TABS.map((t) => ({ ...t, icon: ICONS[t.id] }));
