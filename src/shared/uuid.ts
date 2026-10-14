/** An RFC 4122 v4 UUID. randomUUID is secure-context only, so a content script on an http:// page falls back to getRandomValues. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte, i) => {
    const v = i === 6 ? (byte & 0x0f) | 0x40 : i === 8 ? (byte & 0x3f) | 0x80 : byte;
    return v.toString(16).padStart(2, '0');
  }).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `<prefix>-<8 hex chars>`, for DOM ids. */
export function id(prefix = 'id'): string {
  return `${prefix}-${uuid().slice(0, 8)}`;
}
