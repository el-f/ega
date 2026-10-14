import { describe } from 'vitest';
import { runConformanceSuite } from '@tests/_helpers/conformance';
import { NativeBackend } from '@/shared/backends/native';

describe('Native backend conformance', () => {
  runConformanceSuite(() => new NativeBackend());
});
