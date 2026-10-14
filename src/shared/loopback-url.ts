/** SSRF guard: only literal loopback hostnames pass, so there is no DNS lookup and no rebinding window. */
export function isLoopbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    // URL parses [::1] as the bracketed hostname '[::1]'.
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}
