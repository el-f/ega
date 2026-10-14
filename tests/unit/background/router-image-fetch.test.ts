import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchImageForVision } from '@/background/router-image';

const MB = 1024 * 1024;

/** Ten bytes that sniff as PNG; the media type is settled by the bytes, not the header. */
function png10(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
}

// Hand-rolled response: the standard Response constructor strips content-length.
function fakeResponse(over: {
  headers?: Record<string, string>;
  body?: ReadableStream<Uint8Array> | null;
  bytes?: Uint8Array;
}): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(over.headers ?? { 'content-type': 'image/png' }),
    body: over.body ?? null,
    arrayBuffer: async () => (over.bytes ?? png10()).buffer,
  } as unknown as Response;
}

const URL = 'https://example.com/img.png';

function fetchImage() {
  return fetchImageForVision(URL, new AbortController().signal);
}

afterEach(() => vi.unstubAllGlobals());

describe('vision image fetch — size and time budgets', () => {
  it('rejects on the declared content-length before reading the body', async () => {
    let bodyRead = false;
    // highWaterMark 0: pull only runs on an actual read, so the flag tracks our code, not stream prefill.
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyRead = true;
          controller.enqueue(png10());
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse({
          headers: { 'content-type': 'image/png', 'content-length': String(10 * MB) },
          body: stream,
        }),
      ),
    );

    expect(await fetchImage()).toEqual({
      ok: false,
      code: 'IMAGE_UNSUPPORTED',
      message: 'This image is over 4 MB. Save a smaller copy and attach it instead.',
    });
    expect(bodyRead).toBe(false);
  });

  it('aborts an unbounded body at the 4 MB cap instead of buffering it whole', async () => {
    let pulls = 0;
    let cancelled = false;
    // No content-length; yields 1 MB forever.
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(MB));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ body: endless })),
    );

    expect(await fetchImage()).toEqual({
      ok: false,
      code: 'IMAGE_UNSUPPORTED',
      message: 'This image is over 4 MB. Save a smaller copy and attach it instead.',
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(8);
  });

  it('rejects a non-image content-type from the header, before the download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ headers: { 'content-type': 'text/html' } })),
    );

    expect(await fetchImage()).toEqual({
      ok: false,
      code: 'IMAGE_UNSUPPORTED',
      message:
        'Ega reads PNG, JPEG, WebP and GIF images — this one is text/html. Save it as PNG and attach the file instead.',
    });
  });

  it('a missing Content-Type is settled by the bytes, not assumed to be PNG', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(jpeg, { status: 200, headers: {} })),
    );
    const r = await fetchImage();
    expect(r.ok ? r.image.mediaType : r).toBe('image/jpeg');
  });

  it('no Content-Type over a non-image body is rejected instead of being sent as PNG', async () => {
    const html = new TextEncoder().encode('<html><body>nope</body></html>');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200, headers: {} })),
    );
    expect(await fetchImage()).toMatchObject({ ok: false, code: 'IMAGE_UNSUPPORTED' });
  });

  it('gives the fetch its own abort signal (composed timeout budget)', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(png10(), { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchImage();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.redirect).toBe('manual');
  });

  it('a cancel during the download comes back as ABORTED', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        ctrl.abort();
        throw init?.signal?.reason ?? new DOMException('aborted', 'AbortError');
      }),
    );

    expect(await fetchImageForVision(URL, ctrl.signal)).toEqual({
      ok: false,
      code: 'ABORTED',
      message: 'cancelled',
    });
  });

  it.each([
    [403, 'The site would not hand Ega this image (HTTP 403).'],
    [401, 'The site would not hand Ega this image (HTTP 401).'],
    [404, 'This image is no longer at that address (HTTP 404).'],
    [410, 'This image is no longer at that address (HTTP 410).'],
  ])('a %i from the image host is a refusal with the save-and-attach step', async (status, why) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status })),
    );

    expect(await fetchImage()).toEqual({
      ok: false,
      code: 'IMAGE_UNSUPPORTED',
      message: `${why} Save the image and attach the file instead.`,
    });
  });

  const MOVED = {
    ok: false,
    code: 'IMAGE_UNSUPPORTED',
    message:
      'The site moved this image to another address, which Ega does not follow. Save the image and attach the file instead.',
  };

  it('a raw 3xx is refused without a second request', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin.png' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchImage()).toEqual(MOVED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Chrome's opaque redirect (status 0) is refused the same way", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ type: 'opaqueredirect', ok: false, status: 0 }) as unknown as Response),
    );

    expect(await fetchImage()).toEqual(MOVED);
  });

  it.each([408, 429, 503])('a %i stays a retryable network failure', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status })),
    );

    expect(await fetchImage()).toEqual({
      ok: false,
      code: 'NETWORK',
      message: `Failed to fetch image: fetch ${status}`,
    });
  });

  it('streams a small body through as base64', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(png10(), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );

    expect(await fetchImage()).toEqual({
      ok: true,
      image: { mediaType: 'image/png', imageBase64: btoa(String.fromCharCode(...png10())) },
    });
  });
});
