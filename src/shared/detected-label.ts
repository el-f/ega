import { getPreset } from '@/shared/presets';
import { isIsoCode, labelFor } from '@/shared/languages';

/** Drops a detail that only repeats the language ("Arabizi", "en") and a leading "French — " / "French (…)" echo. */
function withoutEcho(detail: string, base: string, id: string): string {
  const d = detail.toLowerCase();
  if (d === base.toLowerCase() || d === id.toLowerCase()) return '';
  for (const name of [base, id]) {
    if (!d.startsWith(name.toLowerCase())) continue;
    const m = /^\s*(?:[—–:-]\s*(\S.*)|\((.+)\))$/.exec(detail.slice(name.length));
    if (m) return (m[1] ?? m[2] ?? '').trim();
  }
  return detail;
}

/** The detail can already carry its own parens ("Levantine (Lebanese)"), so the separator is an em-dash. */
export function formatDetectedLabel(
  detectedLang: string | undefined,
  detectedDetail: string | undefined,
  varieties: readonly { id: string; label: string }[] = [],
): string {
  // The prompt tells the model to answer 'other' and name the language in the detail, so the pill shows the detail alone.
  const id = detectedLang?.toLowerCase() === 'other' ? undefined : detectedLang;
  // An id no table knows stays verbatim: upper-casing a custom variety's uuid helps nobody.
  const base = id
    ? (getPreset(id)?.label ??
      varieties.find((v) => v.id === id)?.label ??
      (isIsoCode(id) ? labelFor(id) : id))
    : '';
  const raw = (detectedDetail ?? '').trim();
  const detail = base && id ? withoutEcho(raw, base, id) : raw;
  if (base && detail) return `${base} — ${detail}`;
  if (base) return base;
  if (detail) return detail;
  return '';
}
