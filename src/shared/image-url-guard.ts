import { IMAGE_DATA_URL_MAX_CHARS, IMAGE_FETCH_MAX_BYTES } from './constants';
/** Loopback and RFC1918 pass on purpose: the user could already render the image. */
export function validateImageUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `scheme ${url.protocol} not allowed` };
  }
  // A trailing dot is the same name in DNS (`foo.local.`), so strip it before the suffix checks.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'mDNS / reserved TLD' };
  }
  // URL.hostname returns IPv6 bracketed (`[fe80::1]`).
  const h6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  // `::ffff:a9fe:a9fe` connects to the embedded v4 address, so the v4 checks must see it.
  const v4host = decodeMappedIpv4(h6) ?? host;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(v4host);
  if (ipv4) {
    const [, a, b] = ipv4;
    const oct1 = Number(a);
    const oct2 = Number(b);
    if (
      oct1 === 0 ||
      (oct1 === 169 && oct2 === 254) || // link-local + AWS/GCP metadata
      (oct1 === 100 && oct2 >= 64 && oct2 <= 127) || // RFC 6598 CGN (covers Alibaba 100.100.100.200)
      oct1 >= 224 // multicast + reserved
    ) {
      return { ok: false, reason: `reserved / metadata IP ${v4host}` };
    }
  }
  const group = firstIpv6Group(h6);
  // fe80::/10 is the whole link-local block — `fe81::1` and `febf::1` are in it too.
  if ((group !== null && (group & 0xffc0) === 0xfe80) || h6.startsWith('fd00:ec2:')) {
    return { ok: false, reason: 'IPv6 link-local / metadata' };
  }
  return { ok: true };
}

/** First hex group of an IPv6 literal, or null when `h6` is not one. A leading `::` reads as 0. */
function firstIpv6Group(h6: string): number | null {
  const colon = h6.indexOf(':');
  if (colon === -1) return null;
  const head = h6.slice(0, colon);
  if (head === '') return 0;
  if (!/^[0-9a-f]{1,4}$/i.test(head)) return null;
  return Number.parseInt(head, 16);
}

/** Returns dotted-quad, or null. Handles both `::ffff:a9fe:a9fe` and `::ffff:169.254.169.254`. */
function decodeMappedIpv4(h6: string): string | null {
  const m = /^::ffff:(.+)$/i.exec(h6);
  if (!m) return null;
  const tail = m[1];
  if (tail === undefined) return null;
  if (tail.includes('.')) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hex) return null;
  const [, hiHex, loHex] = hex;
  if (hiHex === undefined || loHex === undefined) return null;
  const hi = Number.parseInt(hiHex, 16);
  const lo = Number.parseInt(loHex, 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

const RASTER_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif)[;,]/i;

/** base64 of the blob ceiling the vision fetch enforces, plus header slack. */
const MAX_DATA_URL_CHARS = Math.ceil(IMAGE_FETCH_MAX_BYTES / 3) * 4 + 64;

/** Accepts http(s) URLs passing the SSRF guard, plus raster data URLs. SVG is rejected. */
export function validateImageSrc(raw: string): { ok: true } | { ok: false; reason: string } {
  if (!raw.startsWith('data:')) return validateImageUrl(raw);
  if (raw.length > MAX_DATA_URL_CHARS) return { ok: false, reason: 'data URL too large' };
  return RASTER_DATA_URL.test(raw) ? { ok: true } : { ok: false, reason: 'unsupported data URL' };
}

export function isSafeRenderImageSrc(raw: string): boolean {
  return validateImageSrc(raw).ok;
}

/** A tooltip image the side panel can take: safe to render, and under the cap the handoff reader keeps. */
export function canHandOffImage(src: string): boolean {
  return src.length <= IMAGE_DATA_URL_MAX_CHARS && validateImageSrc(src).ok;
}

/** Why a composer image cannot be sent, worded for the user; null when it can. */
export function attachedImageProblem(dataUrl: string): string | null {
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    return `That image is over ${IMAGE_FETCH_MAX_BYTES / (1024 * 1024)} MB. Attach a smaller one.`;
  }
  return RASTER_DATA_URL.test(dataUrl)
    ? null
    : 'Only PNG, JPEG, WebP and GIF images can be attached.';
}
