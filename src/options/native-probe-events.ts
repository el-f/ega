import type { ProbeResult } from './probeNativeHost';

const listeners = new Set<(result: ProbeResult) => void>();

/** Every native-host probe that lands, whoever started it: the row header and the card body show one answer. */
export function onNativeProbe(listener: (result: ProbeResult) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitNativeProbe(result: ProbeResult): void {
  for (const listener of listeners) listener(result);
}
