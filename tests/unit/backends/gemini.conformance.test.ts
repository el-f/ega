import { describe } from 'vitest';
import { runConformanceSuite } from '@tests/_helpers/conformance';
import { GeminiBackend } from '@/shared/backends/gemini';

describe('Gemini backend conformance', () => {
  runConformanceSuite(() => new GeminiBackend());
});
