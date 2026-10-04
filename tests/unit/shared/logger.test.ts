import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setLogLevel } from '@/shared/logger';
import { chromeMock } from '@tests/mocks/chrome';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset to production default so test ordering doesn't leak level state.
    setLogLevel('warn');
  });

  it('prefixes messages with scope', () => {
    setLogLevel('warn');
    const log = createLogger('bg');
    log.warn('hello', 42);
    expect(console.warn).toHaveBeenCalledWith('[ega:bg]', 'hello', 42);
  });

  describe('level gating', () => {
    it('suppresses debug/info at default (warn) level, always emits warn/error', () => {
      setLogLevel('warn');
      const log = createLogger('test');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('[ega:test]', 'w');
      expect(console.error).toHaveBeenCalledWith('[ega:test]', 'e');
    });

    it('emits every level when set to debug', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(console.debug).toHaveBeenCalledWith('[ega:test]', 'd');
      expect(console.info).toHaveBeenCalledWith('[ega:test]', 'i');
      expect(console.warn).toHaveBeenCalledWith('[ega:test]', 'w');
      expect(console.error).toHaveBeenCalledWith('[ega:test]', 'e');
    });

    it('level is checked per-call — flipping it post-construction takes effect', () => {
      setLogLevel('warn');
      const log = createLogger('test');
      log.debug('suppressed');
      expect(console.debug).not.toHaveBeenCalled();
      setLogLevel('debug');
      log.debug('now visible');
      expect(console.debug).toHaveBeenCalledWith('[ega:test]', 'now visible');
    });
  });
});

describe('the stored level', () => {
  it('follows the settings row without loading the storage reader', async () => {
    vi.resetModules();
    chromeMock.storage.local._raw.set('ega.settings', { advanced: { debugLogLevel: 'debug' } });
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { createLogger } = await import('@/shared/logger');
    const log = createLogger('lvl');
    await vi.waitFor(() => {
      log.debug('on');
      expect(debug).toHaveBeenCalledWith('[ega:lvl]', 'on');
    });
    await chromeMock.storage.local.set({
      'ega.settings': { advanced: { debugLogLevel: 'error' } },
    });
    debug.mockClear();
    log.debug('off');
    expect(debug).not.toHaveBeenCalled();
    debug.mockRestore();
  });
});
