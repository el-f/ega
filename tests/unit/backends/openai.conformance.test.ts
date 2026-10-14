import { describe } from 'vitest';
import { makeOpenAICompatBackend } from '@/shared/backends/openai-compat';
import { runConformanceSuite } from '@tests/_helpers/conformance';

describe('OpenAI backend conformance', () => {
  runConformanceSuite(() => makeOpenAICompatBackend('openai'));
});
