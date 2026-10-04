import type { ErrCode } from '@/shared/types';
import { optionsTabForMessage } from '@/shared/error-policy';
import { showToast } from './toast';
import { openOptionsFromContent } from './translate-handlers';

/** Shows the first line of a failure the user can fix, with the action that fixes it. False when no setting or reload fixes it. */
export function showFixToast(err: { code: ErrCode; message: string }): boolean {
  const line = err.message.split('\n')[0]?.trim() ?? '';
  if (line === '') return false;
  const tab = optionsTabForMessage(err.message, err.code);
  if (tab !== undefined) {
    showToast(line, { label: 'Open settings', run: () => openOptionsFromContent(tab) });
    return true;
  }
  if (/\breload\b/i.test(err.message)) {
    showToast(line, { label: 'Reload page', run: () => location.reload() });
    return true;
  }
  return false;
}
