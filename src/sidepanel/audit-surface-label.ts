import type { AuditSurface } from '@/shared/audit-log';

/** Where a failure happened, for the panel reporting another surface's error. Null = do not say.
 *  Panel-only on purpose: err-labels.ts is in the eager content-script bundle. */
export function auditSurfaceLabel(surface: AuditSurface | undefined): string | null {
  switch (surface) {
    case 'content':
      return 'On the page';
    case 'popup':
      return 'In the popup';
    case 'options':
      return 'In settings';
    case 'sidepanel':
    case 'unknown':
    case undefined:
      return null;
  }
}
