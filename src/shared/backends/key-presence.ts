import type { Settings, BackendId } from '@/shared/types';
import { CLOUD_PROVIDER_IDS, apiKeyField, type CloudProviderId } from '@/shared/provider-ids';

export function backendNeedsKey(id: BackendId): id is BackendId & CloudProviderId {
  return (CLOUD_PROVIDER_IDS as readonly string[]).includes(id);
}

export function backendHasRequiredKey(id: BackendId, s: Settings): boolean {
  return !backendNeedsKey(id) || Boolean(s[apiKeyField(id)]);
}
