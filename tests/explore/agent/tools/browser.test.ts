import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import { dispatchBrowserTool, type BrowserContextRef } from './browser';

interface MockPage {
  click: Mock;
  fill: Mock;
  goto: Mock;
  waitForSelector: Mock;
  waitForTimeout: Mock;
  evaluate: Mock;
  getByRole: Mock;
}

function makePage(): MockPage {
  const locator = { click: vi.fn(async () => undefined) };
  return {
    click: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    goto: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => '<html><body/></html>'),
    getByRole: vi.fn(() => locator),
  };
}

function makeRef(page: MockPage): BrowserContextRef {
  return {
    context: {} as BrowserContext,
    page: page as unknown as Page,
  };
}

describe('dispatchBrowserTool', () => {
  it('routes browser_click via selector', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_click', { selector: 'button.x' });
    expect(r.ok).toBe(true);
    expect(page.click).toHaveBeenCalledWith('button.x');
  });

  it('routes browser_click via role + name', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_click', {
      role: 'button',
      name: 'Save',
    });
    expect(r.ok).toBe(true);
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Save' });
  });

  it('rejects unsupported role and missing selector', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_click', { role: 'banner' });
    expect(r.ok).toBe(false);
  });

  it('routes browser_type', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_type', {
      selector: 'input',
      value: 'hi',
    });
    expect(r.ok).toBe(true);
    expect(page.fill).toHaveBeenCalledWith('input', 'hi');
  });

  it('clamps browser_wait timeout to 5s', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_wait', { ms: 60_000 });
    expect(r.ok).toBe(true);
    expect(page.waitForTimeout).toHaveBeenCalledWith(5_000);
  });

  it('browser_snapshot returns evaluate result string', async () => {
    const page = makePage();
    page.evaluate.mockResolvedValueOnce('<html>x</html>');
    const r = await dispatchBrowserTool(makeRef(page), 'browser_snapshot', {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toContain('<html>x</html>');
  });

  it('browser_navigate calls goto', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_navigate', {
      url: 'http://example.com',
    });
    expect(r.ok).toBe(true);
    expect(page.goto).toHaveBeenCalledWith('http://example.com');
  });

  it('returns error on unknown tool name', async () => {
    const page = makePage();
    const r = await dispatchBrowserTool(makeRef(page), 'browser_bogus', {});
    expect(r.ok).toBe(false);
  });

  it('returns error when click throws', async () => {
    const page = makePage();
    page.click.mockRejectedValueOnce(new Error('element not found'));
    const r = await dispatchBrowserTool(makeRef(page), 'browser_click', { selector: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('element not found');
  });
});
