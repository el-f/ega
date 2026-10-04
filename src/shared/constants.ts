import type { PatchAck } from './settings-bus';

export const STORAGE_KEYS = {
  settings: 'ega.settings',
  customLanguages: 'ega.customLanguages',
  customTasks: 'ega.customTasks',
  pendingImageSeed: 'ega.pendingImageSeed',
} as const;

export const NATIVE_HOST_NAME = 'com.ega.host';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
/** LM Studio's port; llama-server listens on 8080. */
export const DEFAULT_LOCAL_SERVER_URL = 'http://127.0.0.1:1234';

export const MAX_SELECTION_CHARS = 2000;

/** Stands in for the turn content when an image is sent with no notes. */
export const IMAGE_TURN_PLACEHOLDER = '[image]';
/** Longest image data URL a turn, a draft or a popup handoff keeps; chrome.storage.local gives the whole extension 10 MB. */
export const IMAGE_DATA_URL_MAX_CHARS = 256 * 1024;
/** Largest image blob the vision fetch hands a provider. */
export const IMAGE_FETCH_MAX_BYTES = 4 * 1024 * 1024;

export const DEFAULT_SELECTION_CONTEXT_CAP = 200;
export const DEFAULT_SMART_BUBBLE_MIN_LENGTH = 6;
export const DEFAULT_HEADING_TRAIL_DEPTH = 3;
export const DEFAULT_HEADING_TRAIL_ENTRY_CAP = 120;
export const DEFAULT_DESCRIPTION_CONTEXT_CAP = 200;
export const DEFAULT_POST_TEXT_CAP = 800;
/** How long the popup may still read a selection the page has since dropped. */
export const RECENT_SELECTION_TTL_MS = 60_000;
export const DEFAULT_TRANSLATE_TIMEOUT_MS = 60_000;
export const DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS = 120_000;
export const DEFAULT_LOCAL_BACKEND_TIMEOUT_MS = 800;
/** Floor for a ping that has to start the host (Chrome -> cmd.exe -> node): measured 0.1-3.5s under load; a missing host still fails at once by disconnect. */
export const NATIVE_COLD_BOOT_TIMEOUT_MS = 5_000;
/** Catches a native host that answers `ping` but never the translate frame; must stay well above a cold CLI spawn (~7.6s). */
export const NATIVE_FIRST_FRAME_TIMEOUT_MS = 30_000;
export const DEFAULT_BATCH_CONCURRENCY = 3;
export const DEFAULT_CONFIDENCE_PILL_THRESHOLD = 0;
/** One frame: batches deltas so each SSE token is not its own IPC message + full re-parse; 0 = unbatched. */
export const DEFAULT_STREAMING_FLUSH_MS = 20;
/** Holds cancels that arrive before their translate:start; oldest evict first. */
export const CANCEL_PRE_REG_CAP = 256;

export const QUOTA_MESSAGE =
  'Storage is full, so the change was not saved. Start a new conversation in the side panel to free space.';
export const SCHEMA_MESSAGE =
  'That value was rejected, so the change was not saved. Reload the page and try again.';
const SAVE_FAILED_MESSAGE = 'The change was not saved. Try again.';

/** What every surface tells the user when a settings write comes back `ok: false`. */
export function settingsSaveFailedMessage(reason: PatchAck['reason']): string {
  if (reason === 'quota') return QUOTA_MESSAGE;
  if (reason === 'schema') return SCHEMA_MESSAGE;
  return SAVE_FAILED_MESSAGE;
}
