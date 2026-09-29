import { describe } from 'vitest';
import { runConformanceSuite } from '@tests/_helpers/conformance';
import { OllamaBackend } from '@/shared/backends/ollama';

describe('Ollama backend conformance', () => {
  runConformanceSuite(() => new OllamaBackend());
});
