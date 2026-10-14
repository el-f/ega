// The first import of content/index.ts, so no module after it subscribes to storage.local before the switch.
import { takeStoredChangesFromWorker } from '@/shared/stored-changes';
import { setLogLevel } from '@/shared/logger';

takeStoredChangesFromWorker();
// Set before any createLogger, so the logger never reads the raw settings row (API keys included) in a page.
setLogLevel('warn');
