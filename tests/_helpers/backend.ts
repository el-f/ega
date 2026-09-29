import { asBackendIdUnsafe } from '@/shared/brands';
import type {
  BackendCapabilities,
  TranslateImageArgs,
  TranslationBackend,
} from '@/shared/backends/base';

/** `translateImage` is optional on the interface — throw loudly instead of no-oping a vision test. */
export function requireTranslateImage(
  b: TranslationBackend,
): (args: TranslateImageArgs) => Promise<void> {
  if (!b.translateImage) throw new Error(`backend ${b.id} does not implement translateImage`);
  return b.translateImage.bind(b);
}

/** Minimal manifest for test doubles; pass canVision=true only for doubles with translateImage. */
export function testManifest(id: string, canVision = false): BackendCapabilities {
  const bid = asBackendIdUnsafe(id);
  return { id: bid, name: `Test ${id}`, capabilities: { canVision } };
}

/** A 200 response that streams `body` as server-sent events. */
export function sse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
