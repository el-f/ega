import type { ErrCode } from '@/shared/types';
import { assertNever } from '@/shared/assertNever';

/** Short user-facing label. The raw code stays for logs but never reaches the UI bare. */
export function errCodeLabel(code: ErrCode): string {
  switch (code) {
    case 'NETWORK':
      return 'Network issue';
    case 'SERVER':
      return 'Backend error';
    case 'AUTH':
      return 'Authentication failed';
    case 'RATE_LIMIT':
      return 'Rate limit reached';
    case 'QUOTA':
      return 'Out of credit';
    case 'REQUEST':
      return 'Request rejected';
    case 'NATIVE_NOT_INSTALLED':
      return 'Native host not installed';
    case 'NATIVE_SPAWN_FAIL':
      return 'Could not start native host';
    case 'ABORTED':
      return 'Canceled';
    case 'TIMEOUT':
      return 'Timed out';
    case 'PARSE':
      return 'Could not read the reply';
    case 'PROTOCOL':
      return 'Reply was cut short';
    case 'UNSUPPORTED':
      return 'Unsupported';
    case 'IMAGE_UNSUPPORTED':
      return 'Cannot use this image';
    case 'NO_BACKEND':
      return 'Setup needed';
    case 'UNKNOWN':
      return 'Error';
    default:
      assertNever(code);
  }
}
