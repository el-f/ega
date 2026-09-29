import { resolveActiveBackendId } from '@/shared/backend-params';
import { DEFAULT_NATIVE_CLI, isKnownNativeCli } from '@/shared/native-cli-registry';
import type { Settings } from '@/shared/types';

/** Safe to act on at every boot — the host's `getOrSpawn` lands on the already-spawned child. */
export function resolvePreWarmProvider(s: Settings): string | null {
  if (s.preWarmNative === false) return null;
  if (resolveActiveBackendId(s) !== 'native') return null;
  return isKnownNativeCli(s.nativeCli) ? s.nativeCli : DEFAULT_NATIVE_CLI;
}
