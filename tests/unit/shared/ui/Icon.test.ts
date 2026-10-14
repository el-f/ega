// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Copy } from '@lucide/svelte';
import Icon from '@/shared/ui/Icon.svelte';

describe('Icon', () => {
  it('renders the given lucide icon', () => {
    const { container } = render(Icon, { props: { icon: Copy } });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies default size 20', () => {
    const { container } = render(Icon, { props: { icon: Copy } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });

  it('honors explicit size', () => {
    const { container } = render(Icon, { props: { icon: Copy, size: 24 } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
  });

  it('applies default stroke-width 1.5', () => {
    const { container } = render(Icon, { props: { icon: Copy } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('stamps data-ega-icon for E2E hooks', () => {
    const { container } = render(Icon, { props: { icon: Copy } });
    expect(container.querySelector('[data-ega-icon]')).not.toBeNull();
  });

  it('forwards the class prop', () => {
    const { container } = render(Icon, { props: { icon: Copy, class: 'my-class' } });
    expect(container.querySelector('.my-class')).not.toBeNull();
  });

  it('honors strokeWidth override', () => {
    const { container } = render(Icon, { props: { icon: Copy, strokeWidth: 2 } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('2');
  });

  it('renders at size 28 (upper bound)', () => {
    const { container } = render(Icon, { props: { icon: Copy, size: 28 } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('28');
    expect(svg?.getAttribute('height')).toBe('28');
  });

  it('is aria-hidden by default (decorative)', () => {
    const { container } = render(Icon, { props: { icon: Copy } });
    const wrap = container.querySelector('[data-ega-icon]');
    expect(wrap?.getAttribute('aria-hidden')).toBe('true');
    expect(wrap?.getAttribute('role')).toBeNull();
  });

  it('takes aria-label when provided (meaningful)', () => {
    const { container } = render(Icon, { props: { icon: Copy, ariaLabel: 'Copy' } });
    const wrap = container.querySelector('[data-ega-icon]');
    expect(wrap?.getAttribute('role')).toBe('img');
    expect(wrap?.getAttribute('aria-label')).toBe('Copy');
    expect(wrap?.getAttribute('aria-hidden')).toBeNull();
  });
});
