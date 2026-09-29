import { describe, expect, it } from 'vitest';
import { isSafeRenderImageSrc, validateImageSrc, validateImageUrl } from '@/shared/image-url-guard';
import { IMAGE_FETCH_MAX_BYTES } from '@/shared/constants';

describe('validateImageUrl', () => {
  it('accepts plain https and http URLs', () => {
    expect(validateImageUrl('https://example.com/a.png').ok).toBe(true);
    expect(validateImageUrl('http://example.com/a.png').ok).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateImageUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateImageUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateImageUrl('data:image/png;base64,AAAA').ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateImageUrl('not a url').ok).toBe(false);
  });

  it('rejects cloud-metadata and reserved IPv4 ranges', () => {
    expect(validateImageUrl('https://169.254.169.254/latest/meta-data/').ok).toBe(false);
    expect(validateImageUrl('http://100.100.100.200/').ok).toBe(false);
    expect(validateImageUrl('http://0.0.0.0/').ok).toBe(false);
    expect(validateImageUrl('http://224.0.0.1/').ok).toBe(false);
  });

  it('rejects mDNS / reserved TLDs and IPv6 link-local/metadata', () => {
    expect(validateImageUrl('http://printer.local/img.png').ok).toBe(false);
    expect(validateImageUrl('http://svc.internal/img.png').ok).toBe(false);
    expect(validateImageUrl('http://[fe80::1]/img.png').ok).toBe(false);
    expect(validateImageUrl('http://[fd00:ec2::254]/img.png').ok).toBe(false);
  });

  it('rejects the whole fe80::/10 block, not just addresses starting `fe80:`', () => {
    for (const host of ['fe81::1', 'fe90::1', 'feaa::1', 'febf:ffff::1', 'fe80:1:2:3:4:5:6:7']) {
      expect(validateImageUrl(`http://[${host}]/img.png`).ok, host).toBe(false);
    }
  });

  it('allows IPv6 outside fe80::/10 that merely looks close', () => {
    for (const host of ['fec0::1', 'fe7f::1', 'ff00::1', '2001:db8::1', 'fd00:1234::1']) {
      expect(validateImageUrl(`http://[${host}]/img.png`).ok, host).toBe(true);
    }
  });

  it('allows loopback and RFC1918 (user already rendered the img)', () => {
    expect(validateImageUrl('http://127.0.0.1/a.png').ok).toBe(true);
    expect(validateImageUrl('http://192.168.1.10/a.png').ok).toBe(true);
  });

  it('rejects IPv4-mapped IPv6 forms of the metadata endpoint', () => {
    // new URL() turns [::ffff:169.254.169.254] into [::ffff:a9fe:a9fe], which still reaches the v4 metadata IP.
    expect(validateImageUrl('http://[::ffff:169.254.169.254]/latest/').ok).toBe(false);
    expect(validateImageUrl('http://[::ffff:a9fe:a9fe]/latest/').ok).toBe(false);
    // Alibaba metadata 100.100.100.200 (CGN range) mapped into v6.
    expect(validateImageUrl('http://[::ffff:6464:64c8]/').ok).toBe(false);
  });
});

describe('isSafeRenderImageSrc', () => {
  it('accepts http(s) URLs that pass the SSRF guard', () => {
    expect(isSafeRenderImageSrc('https://example.com/a.png')).toBe(true);
  });

  it('rejects http(s) URLs the SSRF guard rejects', () => {
    expect(isSafeRenderImageSrc('https://169.254.169.254/x.png')).toBe(false);
  });

  it('rejects the trailing-dot FQDN form of a blocked name', () => {
    expect(validateImageUrl('http://printer.local./x.png').ok).toBe(false);
    expect(validateImageUrl('http://db.internal./x.png').ok).toBe(false);
    expect(validateImageUrl('http://169.254.169.254./latest').ok).toBe(false);
  });

  it('accepts raster data URLs', () => {
    expect(isSafeRenderImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeRenderImageSrc('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isSafeRenderImageSrc('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isSafeRenderImageSrc('data:image/gif;base64,R0lGOD')).toBe(true);
  });

  it('rejects SVG and non-image data URLs', () => {
    expect(isSafeRenderImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
    expect(isSafeRenderImageSrc('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects javascript:, blob:, and garbage', () => {
    expect(isSafeRenderImageSrc('javascript:alert(1)')).toBe(false);
    expect(isSafeRenderImageSrc('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeRenderImageSrc('')).toBe(false);
    expect(isSafeRenderImageSrc('not a url')).toBe(false);
  });
});

describe('validateImageSrc — data URL size follows the vision fetch cap', () => {
  it('accepts the base64 of a blob at the fetch cap and rejects one past it', () => {
    const atCap = `data:image/png;base64,${'A'.repeat(Math.ceil(IMAGE_FETCH_MAX_BYTES / 3) * 4)}`;
    expect(validateImageSrc(atCap).ok).toBe(true);
    expect(validateImageSrc(`${atCap}${'A'.repeat(65)}`).ok).toBe(false);
  });
});
