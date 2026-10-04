import type { PageContext } from '@/shared/types';
import {
  readPageLang,
  readPageDescription,
  readSiteName,
  readHeadingTrail,
} from '@/shared/page-context';
import {
  DEFAULT_DESCRIPTION_CONTEXT_CAP,
  DEFAULT_HEADING_TRAIL_DEPTH,
  DEFAULT_HEADING_TRAIL_ENTRY_CAP,
  DEFAULT_POST_TEXT_CAP,
} from '@/shared/constants';
import { omitUndef } from '@/shared/utils/omitUndef';
import { extractPostBlockText } from './post-block';

const HEADING_TAG_SET_PAGE = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** A page controls `document.title`, `og:site_name` and `<html lang>`, and
 *  each rides every request — cap them like `pageDescription`. */
function capMeta(v: string): string {
  return v.length > DEFAULT_DESCRIPTION_CONTEXT_CAP
    ? v.slice(0, DEFAULT_DESCRIPTION_CONTEXT_CAP)
    : v;
}

/** Origin + path only: query strings carry tokens, reset codes and search terms that must not reach the LLM. An href that does not parse passes through as is. */
function safePageUrl(href: string): string {
  try {
    const u = new URL(href);
    return u.origin + u.pathname;
  } catch {
    return href;
  }
}

/** Contract the collector needs from the caller. Narrower than
 *  selection's `SelectionInfo` so it's easier to mock in tests. */
interface CollectPageContextInfo {
  beforeText?: string;
  afterText?: string;
  /** The selected range's common ancestor — used as the anchor for
   *  heading-trail collection. When absent, headingTrail is skipped. */
  anchorNode?: Node;
}

/** Per-call tunables. Every field is optional and falls back to its shipped DEFAULT_* constant. */
export interface CollectPageContextTunables {
  descriptionContextCap?: number;
  headingTrailDepth?: number;
  headingTrailEntryCap?: number;
  postTextCap?: number;
}

/** Page context for pageContextLevel: off = empty, minimal = title, url and nearby text, rich adds lang, description, site name, headings and, on a selection, the post block around it. */
export function collectPageContext(
  info: CollectPageContextInfo,
  level: 'minimal' | 'rich',
  doc: Document = document,
  loc: Location = location,
  tunables: CollectPageContextTunables = {},
): PageContext {
  // exactOptionalPropertyTypes: spread optional keys only when present.
  const base: PageContext = {
    ...(doc.title ? { pageTitle: capMeta(doc.title) } : {}),
    ...(loc.href ? { pageUrl: safePageUrl(loc.href) } : {}),
    ...omitUndef({ beforeText: info.beforeText, afterText: info.afterText }),
  };

  if (level === 'minimal') return base;

  const descCap = tunables.descriptionContextCap ?? DEFAULT_DESCRIPTION_CONTEXT_CAP;
  const trailDepth = tunables.headingTrailDepth ?? DEFAULT_HEADING_TRAIL_DEPTH;
  const trailEntryCap = tunables.headingTrailEntryCap ?? DEFAULT_HEADING_TRAIL_ENTRY_CAP;

  const pageLang = readPageLang(doc);
  const rawDesc = readPageDescription(doc);
  const pageDescription = rawDesc && rawDesc.length > descCap ? rawDesc.slice(0, descCap) : rawDesc;
  const siteName = readSiteName(doc);
  const headingTrail = info.anchorNode
    ? readHeadingTrail(info.anchorNode, trailDepth, trailEntryCap)
    : [];
  const postText = info.anchorNode
    ? extractPostBlockText(info.anchorNode, tunables.postTextCap ?? DEFAULT_POST_TEXT_CAP)
    : undefined;

  return {
    ...base,
    ...(pageLang ? { pageLang: capMeta(pageLang) } : {}),
    ...(pageDescription ? { pageDescription } : {}),
    ...(siteName ? { siteName: capMeta(siteName) } : {}),
    ...(headingTrail.length > 0 ? { headingTrail } : {}),
    ...(postText ? { postText } : {}),
  };
}

/** For popup-typed text: no selection, so no before/after text, and headings come from the top of the page. */
export function collectPageLevelContext(
  level: 'minimal' | 'rich',
  doc: Document = document,
  loc: Location = location,
  tunables: CollectPageContextTunables = {},
): PageContext {
  const base: PageContext = {
    ...(doc.title ? { pageTitle: capMeta(doc.title) } : {}),
    ...(loc.href ? { pageUrl: safePageUrl(loc.href) } : {}),
  };

  if (level === 'minimal') return base;

  const descCap = tunables.descriptionContextCap ?? DEFAULT_DESCRIPTION_CONTEXT_CAP;
  const trailDepth = tunables.headingTrailDepth ?? DEFAULT_HEADING_TRAIL_DEPTH;
  const trailEntryCap = tunables.headingTrailEntryCap ?? DEFAULT_HEADING_TRAIL_ENTRY_CAP;

  const pageLang = readPageLang(doc);
  const rawDesc = readPageDescription(doc);
  const pageDescription = rawDesc && rawDesc.length > descCap ? rawDesc.slice(0, descCap) : rawDesc;
  const siteName = readSiteName(doc);
  const headingTrail = collectTopOfPageHeadings(doc, trailDepth, trailEntryCap);

  return {
    ...base,
    ...(pageLang ? { pageLang: capMeta(pageLang) } : {}),
    ...(pageDescription ? { pageDescription } : {}),
    ...(siteName ? { siteName: capMeta(siteName) } : {}),
    ...(headingTrail.length > 0 ? { headingTrail } : {}),
  };
}

function collectTopOfPageHeadings(doc: Document, depth: number, entryCap: number): string[] {
  // doc.body typed HTMLElement; null at runtime on pre-parse documents.
  const body = doc.body;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!body) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // Stops after `depth` matches, so the cost is bounded by where that heading sits, not by the size of the subtree.
  const nodes = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const node of Array.from(nodes)) {
    if (!HEADING_TAG_SET_PAGE.has(node.tagName)) continue;
    const raw = node.textContent.replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const key = `${node.tagName}:${raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw.length > entryCap ? raw.slice(0, entryCap) : raw);
    if (out.length >= depth) break;
  }
  return out;
}
