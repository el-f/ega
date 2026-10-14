import { describe, it, expect } from 'vitest';
import { ctxBudget } from '@/content/selection';

describe('ctxBudget', () => {
  it('returns the default 200 for an unknown host', () => {
    expect(ctxBudget('example.com')).toBe(200);
  });

  it('returns the expanded 1000 for WhatsApp Web', () => {
    expect(ctxBudget('web.whatsapp.com')).toBe(1000);
  });

  it('returns the expanded 1000 for Discord', () => {
    expect(ctxBudget('discord.com')).toBe(1000);
  });

  it('returns the expanded 1000 for Telegram Web', () => {
    expect(ctxBudget('web.telegram.org')).toBe(1000);
  });

  it('returns the default for subdomains not explicitly in the library', () => {
    // whatsapp.com without the `web.` prefix is the landing page, not the chat app.
    expect(ctxBudget('whatsapp.com')).toBe(200);
  });

  describe('selectionContextCap (the "Selection window" slider)', () => {
    it('uses the user cap as the base budget on a normal host', () => {
      expect(ctxBudget('example.com', 500)).toBe(500);
      expect(ctxBudget('example.com', 50)).toBe(50);
    });

    it('keeps the messenger budget as a floor — never narrower than 1000 on chat hosts', () => {
      expect(ctxBudget('web.whatsapp.com', 50)).toBe(1000);
      expect(ctxBudget('web.whatsapp.com', 500)).toBe(1000);
    });

    it('lets a user cap WIDER than the messenger floor win on chat hosts', () => {
      expect(ctxBudget('web.whatsapp.com', 1500)).toBe(1500);
    });

    it('falls back to the 200 default when no cap is supplied', () => {
      expect(ctxBudget('example.com')).toBe(200);
    });
  });
});
