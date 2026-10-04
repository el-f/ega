import type { PageContext } from '@/shared/types';

const AROUND_CHARS = 140;
const SENT_CHARS = 160;

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The page text on each side of what was sent, trimmed to the part nearest to it. */
export function aroundText(
  ctx: PageContext | null | undefined,
  sent: string,
): { before: string; sent: string; after: string } | null {
  const before = squash(ctx?.beforeText ?? '');
  const after = squash(ctx?.afterText ?? '');
  if (before === '' && after === '') return null;
  const s = squash(sent);
  return {
    before: before.length > AROUND_CHARS ? `…${before.slice(-AROUND_CHARS)}` : before,
    sent: s.length > SENT_CHARS ? `${s.slice(0, SENT_CHARS)}…` : s,
    after: after.length > AROUND_CHARS ? `${after.slice(0, AROUND_CHARS)}…` : after,
  };
}

/** Host and path, without the scheme or a trailing slash; the full address stays in the expanded view. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}
