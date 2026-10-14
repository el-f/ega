import { test, expect } from '@playwright/test';
import { launchExtension, mockAnthropic, resetRoutes } from './helpers';

// A harness guard, not a product flow: an unmocked call must fail the spec, never reach a real API.
test('the harness aborts unmocked external requests and still lets a mock answer', async () => {
  const ext = await launchExtension();
  try {
    const page = await ext.context.newPage();
    await page.goto(`${ext.serverUrl}/selection-page.html`);
    // Only the guard's own abort reads as 'blocked': a real API answer the page cannot read (CORS) fails another way.
    const statusOf = async (url: string): Promise<number | 'blocked' | 'failed'> => {
      const failure = page
        .waitForEvent('requestfailed', { predicate: (r) => r.url() === url, timeout: 15_000 })
        .then((r) => r.failure()?.errorText ?? '')
        .catch(() => '');
      const status = await page.evaluate(
        (u) =>
          fetch(u, { method: 'POST', body: '{}' }).then(
            (r) => r.status,
            () => null,
          ),
        url,
      );
      if (status !== null) return status;
      return (await failure).includes('ERR_BLOCKED_BY_CLIENT') ? 'blocked' : 'failed';
    };

    expect(await statusOf('https://api.openai.com/v1/chat/completions')).toBe('blocked');

    mockAnthropic(ext.context);
    expect(await statusOf('https://api.anthropic.com/v1/messages')).toBe(200);

    await resetRoutes(ext.context);
    expect(await statusOf('https://api.anthropic.com/v1/messages')).toBe('blocked');
  } finally {
    await ext.close();
  }
});
