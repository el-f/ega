import type { TaskEffort } from '@/shared/settings-schema';

export const EFFORT_LABEL: Readonly<Record<TaskEffort, string>> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
