interface IsoLanguage {
  /** ISO 639-1 when available, else 639-3. */
  code: string;
  /** English label. Used verbatim in the prompt template. */
  label: string;
}

export const ISO_LANGUAGES: readonly IsoLanguage[] = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'he', label: 'Hebrew' },
  { code: 'fa', label: 'Persian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'cs', label: 'Czech' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'ro', label: 'Romanian' },
  { code: 'el', label: 'Greek' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'hr', label: 'Croatian' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'et', label: 'Estonian' },
  { code: 'is', label: 'Icelandic' },
  { code: 'ga', label: 'Irish' },
  { code: 'cy', label: 'Welsh' },
  { code: 'mt', label: 'Maltese' },
  { code: 'eu', label: 'Basque' },
  { code: 'ca', label: 'Catalan' },
  { code: 'gl', label: 'Galician' },
  { code: 'sw', label: 'Swahili' },
  { code: 'am', label: 'Amharic' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'ha', label: 'Hausa' },
  { code: 'zu', label: 'Zulu' },
  { code: 'xh', label: 'Xhosa' },
  { code: 'tl', label: 'Filipino' },
  { code: 'my', label: 'Burmese' },
  { code: 'km', label: 'Khmer' },
  { code: 'lo', label: 'Lao' },
  { code: 'si', label: 'Sinhala' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'kn', label: 'Kannada' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ne', label: 'Nepali' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ps', label: 'Pashto' },
  { code: 'ku', label: 'Kurdish' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'ka', label: 'Georgian' },
  { code: 'hy', label: 'Armenian' },
]);

const byCode: ReadonlyMap<string, IsoLanguage> = new Map(
  ISO_LANGUAGES.map((l) => [l.code, l] as const),
);

/** English label for an ISO code; an unknown code comes back upper-cased, never empty. */
export function labelFor(code: string): string {
  return byCode.get(code)?.label ?? code.toUpperCase();
}

/** True only for a real ISO code; 'auto' and preset ids are not BCP-47 and must never reach a Web API. */
export function isIsoCode(code: string): boolean {
  return byCode.has(code);
}
