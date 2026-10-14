export type MarkdownRenderer = (raw: string) => string;

// Allowlist: leaving out svg/math/foreignObject closes their mutation-XSS paths.
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'del',
    'span',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
  ],
  // No `class`: Markdown.svelte styles by tag, and a reply could otherwise borrow a global class such as .ega-sr-only.
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'loading', 'align'],
  ALLOW_DATA_ATTR: false,
  // A relative or protocol-relative href resolves against the extension origin, so only absolute web + mail links and page anchors pass.
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
};

// DOMPurify lets any `data:` URI through on <img> regardless of ALLOWED_URI_REGEXP, so the MIME is pinned here.
const RASTER_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Z0-9+/=]+$/i;

function hostOf(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return '';
  }
}

// Exported so tests can reset the cache; production callers use loadMarkdownRenderer.
export const markdownLoaderInternal: { cached: Promise<MarkdownRenderer> | null } = {
  cached: null,
};

// Model output is attacker-influenceable, so a link shows where it goes and an image never fetches.
function harden(root: Element): void {
  const doc = root.ownerDocument;
  for (const a of Array.from(root.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) continue;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('title', href);
    const host = hostOf(href);
    if (!host || a.textContent.includes(host)) continue;
    const label = doc.createElement('span');
    label.className = 'ega-md-link-host';
    label.textContent = ` (${host})`;
    a.after(label);
  }
  for (const img of Array.from(root.querySelectorAll('img'))) {
    if (RASTER_DATA_URI.test(img.getAttribute('src') ?? '')) {
      img.setAttribute('loading', 'lazy');
      continue;
    }
    const span = doc.createElement('span');
    span.className = 'ega-md-img-blocked';
    const alt = img.getAttribute('alt');
    span.textContent = alt !== null && alt !== '' ? alt : '[image]';
    img.replaceWith(span);
  }
}

export function loadMarkdownRenderer(): Promise<MarkdownRenderer> {
  if (markdownLoaderInternal.cached) return markdownLoaderInternal.cached;
  const p = (async (): Promise<MarkdownRenderer> => {
    const [{ marked }, dompurifyMod] = await Promise.all([import('marked'), import('dompurify')]);
    const DOMPurify = dompurifyMod.default;
    marked.setOptions({ breaks: true, gfm: true });
    return (raw: string): string => {
      const html = marked.parse(raw, { async: false }) as string;
      // Harden inside DOMPurify's inert document: an <img> adopted into the live one fetches before harden can drop it.
      const body = DOMPurify.sanitize(html, { ...SANITIZE_CONFIG, RETURN_DOM: true });
      if (!(body instanceof Element)) return '';
      harden(body);
      return body.innerHTML;
    };
  })();
  markdownLoaderInternal.cached = p;
  p.catch(() => {
    // Drop a rejected import so the next call retries instead of re-awaiting it.
    if (markdownLoaderInternal.cached === p) markdownLoaderInternal.cached = null;
  });
  return p;
}
