import type { BackendId } from './types';

/**
 * What the router will do with each backend in use, for the Backends tab and the Generation notes.
 * Pure: it copies the walk in background/router-chain.ts (keep the ready ones in order, cut to 1 + retryCount),
 * and a property test runs both on the same inputs so the screen says what the router does.
 */

/** Ready: a cloud key is set, or a local probe answered. Not ready: no key, or the probe failed. Unknown: no answer yet. */
export type Readiness = 'ready' | 'not-ready' | 'unknown';

export type RouteLabel =
  | { kind: 'first' }
  | { kind: 'backup'; n: number }
  | { kind: 'not-reached' }
  | { kind: 'skipped' }
  | { kind: 'unknown' };

export interface RouteRow {
  id: BackendId;
  label: RouteLabel;
}

/** How a backend takes part in the image path (router.ts: the image chain, cut to depth, then backends that answer images). */
export interface ImageAbility {
  /** canVision, and the model accepts images; 'unknown' while the model check has not answered. */
  inImageChain: boolean | 'unknown';
  /** It has an image method (translateImage). */
  answersImages: boolean;
}

export interface RoutePlan {
  rows: readonly RouteRow[];
  /** The ids a text request tries, in order (the rows marked first or backup). */
  tried: readonly BackendId[];
  /** The first backend an image request tries; null when none; 'unknown' while a check above it is open. */
  firstForImages: BackendId | null | 'unknown';
}

/**
 * @param order computeBackendOrder(settings, registeredIds): backends in use, in order.
 * @param depth 1 + advanced.retryCount.
 */
export function routePlan(
  order: readonly BackendId[],
  readiness: ReadonlyMap<BackendId, Readiness>,
  depth: number,
  image?: (id: BackendId) => ImageAbility,
): RoutePlan {
  const rows: RouteRow[] = [];
  const tried: BackendId[] = [];
  // Once a row above is unknown, a ready row below cannot know its place yet.
  let openAbove = false;
  for (const id of order) {
    const r = readiness.get(id) ?? 'unknown';
    if (r === 'not-ready') {
      // A missing key or a dead probe does not depend on the rows above.
      rows.push({ id, label: { kind: 'skipped' } });
      continue;
    }
    if (tried.length >= depth && !openAbove) {
      rows.push({ id, label: r === 'ready' ? { kind: 'not-reached' } : { kind: 'unknown' } });
      continue;
    }
    if (r === 'unknown' || openAbove) {
      openAbove = true;
      rows.push({ id, label: { kind: 'unknown' } });
      continue;
    }
    rows.push({
      id,
      label: tried.length === 0 ? { kind: 'first' } : { kind: 'backup', n: tried.length },
    });
    tried.push(id);
  }
  return {
    rows,
    tried,
    firstForImages: image ? firstForImages(order, readiness, depth, image) : null,
  };
}

function firstForImages(
  order: readonly BackendId[],
  readiness: ReadonlyMap<BackendId, Readiness>,
  depth: number,
  image: (id: BackendId) => ImageAbility,
): BackendId | null | 'unknown' {
  let members = 0;
  for (const id of order) {
    if (members >= depth) break;
    const ability = image(id);
    const r = readiness.get(id) ?? 'unknown';
    if (ability.inImageChain === false || r === 'not-ready') continue;
    // It may still join the image chain ahead of the rows below, so the answer waits for it.
    if (r === 'unknown' || ability.inImageChain === 'unknown') return 'unknown';
    members += 1;
    if (ability.answersImages) return id;
  }
  return null;
}
