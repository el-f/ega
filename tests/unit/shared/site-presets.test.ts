import { describe, it, expect } from 'vitest';
import { MESSENGER_HOSTS } from '@/shared/site-presets';

describe('MESSENGER_HOSTS', () => {
  it('is exactly the nine hosts docs/PRIVACY.md and the store copy list', () => {
    expect([...MESSENGER_HOSTS].sort()).toEqual(
      [
        'web.whatsapp.com',
        'discord.com',
        'web.telegram.org',
        'app.slack.com',
        'www.instagram.com',
        'www.messenger.com',
        'twitter.com',
        'x.com',
        'www.reddit.com',
      ].sort(),
    );
  });
});
