import * as v from 'valibot';
import type { Settings } from './types';
import { settingsSchema } from './settings-schema';

export { DEFAULT_MODEL, DEFAULT_PROMPT_TEMPLATE } from './settings-schema';

// Kept apart from constants.ts: parsing the schema drags valibot and every prompt into any module that wants one number.

export const DEFAULT_SETTINGS: Readonly<Settings> = v.parse(
  settingsSchema,
  {},
) as Readonly<Settings>;
