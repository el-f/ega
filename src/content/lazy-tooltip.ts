import type * as TipMod from './tipState.svelte';
import { setRenderer } from './request-state';

type Tip = typeof TipMod;

// Tooltip.svelte drags bits-ui + lucide behind it; loading it here keeps ~220 KB off every page.
let modP: Promise<Tip> | null = null;

/** Every other entry point rides this same promise, so a delta cannot overtake the open that created its entry. */
export function openTooltip(o: Parameters<Tip['openTooltip']>[0]): void {
  modP ??= import('./tipState.svelte');
  void modP.then((m) => m.openTooltip(o));
}

/** No tooltip can exist before the first open, so a stray chunk must not pay for the load. */
function afterOpen(fn: (m: Tip) => void): void {
  if (modP) void modP.then(fn);
}

function appendDelta(requestId: string, delta: string, replace?: true): void {
  afterOpen((m) => m.appendDelta(requestId, delta, replace));
}

function finishTooltip(requestId: string, o: Parameters<Tip['finishTooltip']>[1]): void {
  afterOpen((m) => m.finishTooltip(requestId, o));
}

export function finishTooltipDirect(...args: Parameters<Tip['finishTooltipDirect']>): void {
  afterOpen((m) => m.finishTooltipDirect(...args));
}

export function errorTooltip(requestId: string, err: Parameters<Tip['errorTooltip']>[1]): void {
  afterOpen((m) => m.errorTooltip(requestId, err));
}

export function closeTooltip(requestId?: string): void {
  afterOpen((m) => m.closeTooltip(requestId));
}

export async function getTooltipBody(requestId: string): Promise<string | undefined> {
  if (!modP) return undefined;
  return (await modP).getTooltipBody(requestId);
}

setRenderer('tooltip', {
  append: appendDelta,
  finish: finishTooltip,
  error: errorTooltip,
  dispose: closeTooltip,
});
