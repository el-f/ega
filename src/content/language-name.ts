import { varietyLabel } from './tooltip/variety-label';
import { cachedCustomLanguages } from './customs-cache';

// A raw id (`en`, a custom UUID) means nothing to a reader; the browser names ISO codes at no bundle cost.
const isoNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** A language id by name: a custom language's label, a preset's, or the browser's name for an ISO code. */
export function languageName(id: string): string {
  const label = varietyLabel(id, cachedCustomLanguages());
  if (label !== id) return label;
  try {
    return isoNames.of(id) ?? id;
  } catch {
    return id;
  }
}
