// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent } from '@testing-library/svelte';
import CollapsibleInstallPanel from '@/options/components/CollapsibleInstallPanel.svelte';
import type { Platform } from '@/options/nativeHostInstall';

const commands: Record<
  Platform,
  { install: string; uninstall: string; installerFile: string; installerFilename: string }
> = {
  windows: {
    install: 'powershell -c install',
    uninstall: 'powershell -c uninstall',
    installerFile: '@echo off\r\n',
    installerFilename: 'install.cmd',
  },
  macos: {
    install: 'bash install.sh',
    uninstall: 'bash uninstall.sh',
    installerFile: '#!/bin/bash\n',
    installerFilename: 'install.sh',
  },
  linux: {
    install: 'bash install.sh',
    uninstall: 'bash uninstall.sh',
    installerFile: '#!/bin/bash\n',
    installerFilename: 'install.sh',
  },
};

const baseProps = {
  open: true,
  summaryLabel: 'Install command',
  defaultPlatform: 'windows' as Platform,
  commands,
};

describe('CollapsibleInstallPanel', () => {
  it('does NOT render a standalone Extension ID field — the install body embeds it already', () => {
    const { container } = render(CollapsibleInstallPanel, { props: baseProps });
    expect(container.querySelector('#nh-ext-id')).toBeNull();
    expect(container.querySelector('[aria-label="Your extension ID"]')).toBeNull();
  });

  it('renders the install command body inside the open disclosure', () => {
    const { container } = render(CollapsibleInstallPanel, { props: baseProps });
    const codeblock = container.querySelector('[data-testid="nh-install-codeblock"]');
    expect(codeblock).not.toBeNull();
    expect(codeblock?.textContent).toContain('powershell -c install');
  });

  it('keeps the install body collapsed when open=false', () => {
    const { container } = render(CollapsibleInstallPanel, {
      props: { ...baseProps, open: false },
    });
    const details = container.querySelector(
      '[data-testid="nh-install-panel"]',
    ) as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
  });

  it('platform tablist: active tab has tabindex=0, others -1', async () => {
    const { container, getByTestId } = render(CollapsibleInstallPanel, { props: baseProps });
    // Click "Show all" to reveal the tablist.
    const showAll = getByTestId('nh-show-all-platforms');
    await fireEvent.click(showAll);
    const active = container.querySelector('[data-testid="nh-platform-tab-windows"]');
    const other = container.querySelector('[data-testid="nh-platform-tab-macos"]');
    expect(active?.getAttribute('tabindex')).toBe('0');
    expect(other?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on the active platform tab selects and focuses the next tab', async () => {
    const { container, getByTestId } = render(CollapsibleInstallPanel, { props: baseProps });
    await fireEvent.click(getByTestId('nh-show-all-platforms'));
    const windows = getByTestId('nh-platform-tab-windows');
    windows.focus();
    await fireEvent.keyDown(windows, { key: 'ArrowRight' });
    const macos = getByTestId('nh-platform-tab-macos');
    expect(macos.getAttribute('aria-selected')).toBe('true');
    expect(windows.getAttribute('aria-selected')).toBe('false');
    expect(document.activeElement).toBe(macos);
    expect(getByTestId('nh-install-codeblock').textContent).toContain('bash install.sh');
    expect(container.querySelector('.install-actions button')?.textContent).toContain(
      '.sh installer',
    );
  });

  it('ArrowLeft wraps from the first tab to the last; Home and End jump to the ends', async () => {
    const { getByTestId } = render(CollapsibleInstallPanel, { props: baseProps });
    await fireEvent.click(getByTestId('nh-show-all-platforms'));
    const windows = getByTestId('nh-platform-tab-windows');
    const linux = getByTestId('nh-platform-tab-linux');
    windows.focus();
    await fireEvent.keyDown(windows, { key: 'ArrowLeft' });
    expect(linux.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(linux);
    await fireEvent.keyDown(linux, { key: 'Home' });
    expect(windows.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(windows);
    await fireEvent.keyDown(windows, { key: 'End' });
    expect(linux.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(linux);
  });

  it('wires the active platform tab to a tabpanel that holds the install command', async () => {
    const { container, getByTestId } = render(CollapsibleInstallPanel, { props: baseProps });
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[role="tabpanel"]')).toBeNull();
    await fireEvent.click(getByTestId('nh-show-all-platforms'));
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Install platform',
    );
    await fireEvent.click(getByTestId('nh-platform-tab-linux'));
    const linux = getByTestId('nh-platform-tab-linux');
    const panelId = linux.getAttribute('aria-controls') ?? '';
    expect(panelId).not.toBe('');
    const panel = document.getElementById(panelId);
    expect(panel?.getAttribute('role')).toBe('tabpanel');
    expect(panel?.getAttribute('aria-labelledby')).toBe(linux.id);
    expect(panel?.querySelector('[data-testid="nh-install-codeblock"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="nh-install-codeblock"]')).toHaveLength(1);
  });

  it('aligns the platform row on text baselines so the label and tab strip sit on the same line', () => {
    const sfcPath = resolve(process.cwd(), 'src/options/components/CollapsibleInstallPanel.svelte');
    const source = readFileSync(sfcPath, 'utf8');
    const platformRule = source.match(/\.install-platform-row\s*\{[^}]*\}/);
    expect(platformRule, 'expected a .install-platform-row CSS block').not.toBeNull();
    if (!platformRule) return;
    expect(platformRule[0]).toMatch(/align-items:\s*baseline/);
    expect(platformRule[0]).not.toMatch(/align-items:\s*center/);
  });
});
