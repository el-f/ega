/** Validates Chromium shortcut strings (Ctrl+Shift+L, Cmd+K): modifiers Title-Case, key upper-case, joined by '+'. */
export type KeyComboResult = { ok: true; normalized: string } | { ok: false; error: string };

const VALID_MODS = new Set(['ctrl', 'control', 'shift', 'alt', 'option', 'cmd', 'meta', 'command']);

const NAMED_KEY = /^(?:Enter|Escape|Space|Tab|F[1-9]|F1[0-2])$/i;

export function validateKeyCombo(raw: string): KeyComboResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Shortcut required.' };
  const parts = trimmed
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) {
    return { ok: false, error: 'Use a modifier and a key, e.g. Ctrl+Shift+L.' };
  }
  // The filter above drops the empty part a trailing '+' produces, so re-joining catches "Ctrl+".
  if (parts.some((p) => p.length === 0)) {
    return { ok: false, error: 'The shortcut has an empty part, e.g. two + signs in a row.' };
  }
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  const key = parts[parts.length - 1];
  if (key === undefined) {
    return { ok: false, error: 'Shortcut required.' };
  }
  for (const m of mods) {
    if (!VALID_MODS.has(m)) {
      return { ok: false, error: `Unknown modifier: ${m}` };
    }
  }
  if (key.length !== 1 && !NAMED_KEY.test(key)) {
    return {
      ok: false,
      error: 'The key must be one character, or Enter, Escape, Space, Tab or F1–F12.',
    };
  }
  const normalized = parts
    .map((p, i) => {
      if (i < parts.length - 1) {
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }
      return p.toUpperCase();
    })
    .join('+');
  return { ok: true, normalized };
}
