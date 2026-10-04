import type { ErrCode } from '@/shared/types';
import { validateImageSrc } from '@/shared/image-url-guard';
import { IMAGE_FETCH_MAX_BYTES } from '@/shared/constants';

// The router wall-clock only starts after the download, so the fetch needs its own budget.
const IMAGE_FETCH_TIMEOUT_MS = 20_000;

export interface FetchedImage {
  imageBase64: string;
  mediaType: string;
}

export type ImageFetchResult =
  { ok: true; image: FetchedImage } | { ok: false; code: ErrCode; message: string };

const UNSUPPORTED_SRC =
  'Ega can only read images with a normal web address. Save this image and attach the file instead.';
const TOO_LARGE = `This image is over ${IMAGE_FETCH_MAX_BYTES >> 20} MB. Save a smaller copy and attach it instead.`;

function unsupported(what: string): ImageFetchResult {
  return {
    ok: false,
    code: 'IMAGE_UNSUPPORTED',
    message: `Ega reads PNG, JPEG, WebP and GIF images — this one is ${what}. Save it as PNG and attach the file instead.`,
  };
}

/** A retry gets the same answer from the host, so point at the one path that still works. */
function refused(why: string): ImageFetchResult {
  return {
    ok: false,
    code: 'IMAGE_UNSUPPORTED',
    message: `${why} Save the image and attach the file instead.`,
  };
}

/** Fetch + SSRF-validate + media-type/size guard + base64-encode an image for a vision backend. */
export async function fetchImageForVision(
  imageUrl: string,
  signal: AbortSignal,
): Promise<ImageFetchResult> {
  if (!validateImageSrc(imageUrl).ok) {
    return { ok: false, code: 'IMAGE_UNSUPPORTED', message: UNSUPPORTED_SRC };
  }
  const tooLarge: ImageFetchResult = { ok: false, code: 'IMAGE_UNSUPPORTED', message: TOO_LARGE };
  try {
    // The SSRF guard checked this url only, so following a 302 would reach a blocked target the guard never saw.
    const r = await fetch(imageUrl, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)]),
      redirect: 'manual',
    });
    // Chrome hands back an opaque redirect with status 0; Node hands back the raw 3xx.
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) {
      return refused('The site moved this image to another address, which Ega does not follow.');
    }
    if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
      return refused(
        r.status === 404 || r.status === 410
          ? `This image is no longer at that address (HTTP ${r.status}).`
          : `The site would not hand Ega this image (HTTP ${r.status}).`,
      );
    }
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const declaredType = r.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    // A declared non-image type stops before the download; a missing or wrong image type is settled by the bytes below.
    if (declaredType !== '' && !declaredType.startsWith('image/')) return unsupported(declaredType);
    const declared = Number(r.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > IMAGE_FETCH_MAX_BYTES) return tooLarge;
    // Stream with a running byte count so an unbounded body aborts at the cap instead of buffering whole.
    const parts: Uint8Array[] = [];
    let size = 0;
    if (r.body) {
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > IMAGE_FETCH_MAX_BYTES) {
          await reader.cancel();
          return tooLarge;
        }
        parts.push(value);
      }
    } else {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > IMAGE_FETCH_MAX_BYTES) return tooLarge;
      parts.push(buf);
      size = buf.length;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
    // Bytes first; a declared raster type is trusted when the magic is unknown, a missing one is never assumed.
    const mediaType =
      sniffRasterType(bytes) ??
      (/^image\/(?:png|jpe?g|webp|gif)$/.test(declaredType) ? declaredType : null);
    if (mediaType === null) return unsupported(declaredType || 'not a recognized image');
    return { ok: true, image: { imageBase64: bytesToBase64(bytes), mediaType } };
  } catch (e) {
    const msg = (e as Error).message;
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
    return {
      ok: false,
      code: aborted ? 'ABORTED' : timedOut ? 'TIMEOUT' : 'NETWORK',
      message: aborted
        ? 'cancelled'
        : timedOut
          ? 'Image download timed out.'
          : `Failed to fetch image: ${msg}`,
    };
  }
}

/** The media type from the magic bytes; a Content-Type header can be missing or wrong. */
function sniffRasterType(
  b: Uint8Array,
): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null {
  const ascii = (at: number, s: string): boolean =>
    [...s].every((ch, i) => b[at + i] === ch.charCodeAt(0));
  if (b[0] === 0x89 && ascii(1, 'PNG')) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  // String.fromCharCode(...bytes) overflows V8's arg-stack at ~100K args; 32K chunks stay safe.
  const chunkSize = 32 * 1024;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
  }
  return btoa(parts.join(''));
}
