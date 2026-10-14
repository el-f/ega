export function matchShortcut(e: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim());
  const wantCtrl = parts.includes('ctrl');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');
  const wantMeta = parts.includes('command') || parts.includes('meta');
  const key = parts[parts.length - 1] ?? '';
  return (
    e.ctrlKey === wantCtrl &&
    e.shiftKey === wantShift &&
    e.altKey === wantAlt &&
    e.metaKey === wantMeta &&
    e.key.toLowerCase() === key
  );
}
