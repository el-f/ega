import { describe } from 'vitest';
import { runConformanceSuite } from '@tests/_helpers/conformance';
import { AnthropicBackend } from '@/shared/backends/anthropic';

describe('Anthropic backend conformance', () => {
  runConformanceSuite(() => new AnthropicBackend());
});
