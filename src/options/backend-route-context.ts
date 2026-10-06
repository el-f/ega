import { getContext, setContext } from 'svelte';
import type { Readiness, RouteLabel } from '@/shared/route-plan';
import type { BackendId } from '@/shared/types';

/** What the Backends tab tells each row: its place in the route, and where its probe result goes. */
export interface BackendRouteContext {
  /** Null for a backend that is not in use. */
  label: (id: BackendId) => RouteLabel | null;
  /** The first backend an image request tries, when it is not the First choice row. */
  firstForImages: (id: BackendId) => boolean;
  /** A row's own probe answered; the route is drawn from these answers. */
  report: (id: BackendId, readiness: Readiness) => void;
}

const KEY = Symbol('ega.backend-route');

export function setBackendRouteContext(ctx: BackendRouteContext): void {
  setContext(KEY, ctx);
}

/** Null outside the Backends tab (a card mounted alone in a test), where rows show no route. */
export function getBackendRouteContext(): BackendRouteContext | null {
  return getContext<BackendRouteContext | undefined>(KEY) ?? null;
}
