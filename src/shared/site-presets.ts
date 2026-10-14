/** Exact `location.hostname` match — a subdomain needs its own entry. */
export const MESSENGER_HOSTS: ReadonlySet<string> = new Set([
  'web.whatsapp.com',
  'discord.com',
  'web.telegram.org',
  'app.slack.com',
  'www.instagram.com',
  'www.messenger.com',
  'twitter.com',
  'x.com',
  'www.reddit.com',
]);
