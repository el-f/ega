/** Loads the journey JSON files under `CONFIG.runsRoot`, optionally filtered by a glob on the coverage id. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config';

export interface JourneyStep {
  at: number;
  kind: string;
  selector?: string;
  snapshot?: string;
  expr?: string;
  passed?: boolean;
}

export interface JourneyLatency {
  name: string;
  ms: number;
}

export interface JourneyRecord {
  coverage: string;
  steps: ReadonlyArray<JourneyStep>;
  latencies: ReadonlyArray<JourneyLatency>;
  outcome: 'passed' | 'failed' | 'error';
  tracePath?: string;
}

/** Coverage-id glob for `--filter`: `*` matches dots too, so `translation.*` covers every `translation.<surface>.<action>`. */
export function globToRegex(g: string): RegExp {
  const escaped = g.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export async function loadJourneys(
  filter?: string,
  root: string = process.env['EGA_UX_RECORD_DIR'] ?? CONFIG.runsRoot,
): Promise<JourneyRecord[]> {
  const dirents = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files = dirents.filter((d) => d.isFile() && d.name.endsWith('.json'));
  const records: JourneyRecord[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  for (const f of files) {
    try {
      const body = await fs.readFile(path.join(root, f.name), 'utf-8');
      records.push(JSON.parse(body) as JourneyRecord);
    } catch (err) {
      // One unreadable file must not stop the whole run.
      failures.push({ file: f.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failures.length > 0) {
    console.warn(
      `loadJourneys: skipped ${failures.length} unreadable journey file(s):\n` +
        failures.map((f) => `  - ${f.file}: ${f.error}`).join('\n'),
    );
  }
  if (!filter) return records;
  const rx = globToRegex(filter);
  return records.filter((r) => rx.test(r.coverage));
}
