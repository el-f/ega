import type { BrowserContext } from '@playwright/test';

export interface StaleHandoffPayload {
  sourceText: string;
  /** Pass `false` to omit `task` (schema-rejection path). Default: 'translate'. */
  task?: string | false;
  /** Pass `false` to omit `tone`. Default: 'neutral'. */
  tone?: string | false;
  /** Pass `false` to omit `sourceLang`. Default: 'auto'. */
  sourceLang?: string | false;
  /** Pass `false` to omit `targetLang`. Default: 'en'. */
  targetLang?: string | false;
  /** Age in ms below `Date.now()` to stamp as `ts`. Default 90_000, past the 60s gate. */
  ageMs?: number;
}

/** Plants an `ega.pendingPopupHandoff` entry in storage.session; the default 90s age trips the 60s gate in `decodeEntry`. */
export async function plantStaleHandoff(
  context: BrowserContext,
  extensionId: string,
  payload: StaleHandoffPayload = { sourceText: 'stale' },
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await page.evaluate(async (p: StaleHandoffPayload) => {
      // Map shape (`{ <id>: entry }`) so the read path takes the loop branch, not the bare-payload promotion.
      const entry: Record<string, unknown> = { sourceText: p.sourceText };
      if (p.task !== false) entry['task'] = p.task ?? 'translate';
      if (p.tone !== false) entry['tone'] = p.tone ?? 'neutral';
      if (p.sourceLang !== false) entry['sourceLang'] = p.sourceLang ?? 'auto';
      if (p.targetLang !== false) entry['targetLang'] = p.targetLang ?? 'en';
      entry['ts'] = Date.now() - (p.ageMs ?? 90_000);
      const map = { 'planted-stale': entry };
      await chrome.storage.session.set({ 'ega.pendingPopupHandoff': map });
    }, payload);
  } finally {
    await page.close();
  }
}
