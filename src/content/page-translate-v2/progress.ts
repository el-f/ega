import type { ErrorAction } from '@/shared/error-copy';
import type { SettingsTab } from '@/shared/settings-tabs';

/** What the session tells the pill; the pill derives every word and button from it. */
export interface PageProgress {
  /** Blocks that finished, translated or failed. */
  done: number;
  failed: number;
  /** Every collected block except those dropped (gone from the page, already in the target language) or stopped. */
  total: number;
  /** Blocks still waiting for the user to scroll near them. */
  waiting: number;
  /** Blocks dispatched and not finished, or waiting on a retry. */
  inFlight: number;
  /** Blocks released and queued, not dispatched yet. */
  queued: number;
  /** Blocks Stop dropped before they finished. */
  skipped: number;
  /** Every block is finished or dropped. */
  settled: boolean;
  /** The page shows its own text (Show original pressed); the session owns it, so a press can switch it back. */
  showingOriginal?: boolean;
  /** A rate limit holds the queue until this epoch ms. */
  pausedUntil?: number;
  /** The backend that is limiting requests, by display name. */
  pausedBy?: string;
  /** The target language's name, for "Page translated to {target}". */
  target?: string;
  /** The failure most blocks share, from the error catalog. */
  failure?: {
    body: string;
    actions: readonly ErrorAction[];
    tab: SettingsTab;
    /** The providers' own messages, for Error details only. */
    details: string[];
    /** A setting changed since this settings error showed, so Try again leads. */
    settingsChanged?: boolean;
  };
}

export type PillPhase = 'running' | 'paused' | 'idle' | 'settled';

export function pillPhase(p: PageProgress, now: number): PillPhase {
  if (p.settled) return 'settled';
  if (p.pausedUntil !== undefined && p.pausedUntil > now) return 'paused';
  if (p.inFlight === 0 && p.queued === 0 && p.waiting > 0) return 'idle';
  return 'running';
}

function areas(n: number): string {
  return n === 1 ? 'area' : 'areas';
}

/** The pill's one status sentence. */
export function pillStatus(p: PageProgress, now: number): string {
  switch (pillPhase(p, now)) {
    case 'running': {
      const released = p.total - p.waiting;
      return `Translating ${p.done} of ${released} ${areas(released)}…`;
    }
    case 'idle':
      return `${p.done - p.failed} of ${p.total} ${areas(p.total)} translated. The rest translate as you scroll.`;
    case 'paused': {
      const s = Math.max(1, Math.ceil(((p.pausedUntil ?? now) - now) / 1000));
      const who = p.pausedBy ?? 'The AI service';
      return `Paused: ${who} is limiting requests. Resuming in ${s} s.`;
    }
    case 'settled':
      return settledStatus(p);
  }
}

function settledStatus(p: PageProgress): string {
  const picked = p.total + p.skipped;
  const translated = p.done - p.failed;
  if (p.failed > 0) {
    const body = p.failure?.body ?? '';
    const head =
      translated === 0
        ? "Couldn't translate the page."
        : `Couldn't translate ${p.failed} of ${picked} ${areas(picked)}.`;
    return body ? `${head} ${body}` : head;
  }
  if (p.skipped > 0) return `Stopped. Translated ${translated} of ${picked} ${areas(picked)}.`;
  return p.target ? `Page translated to ${p.target}` : 'Page translated';
}

/** The one polite announcement when the session settles. */
export function settleAnnouncement(p: PageProgress): string {
  const picked = p.total + p.skipped;
  if (p.failed > 0) return `Couldn't translate ${p.failed} of ${picked} ${areas(picked)}.`;
  if (p.skipped > 0) return `Stopped. Translated ${p.done - p.failed} of ${picked}.`;
  return 'Page translated.';
}
