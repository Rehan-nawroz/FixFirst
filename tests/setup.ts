import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest globals are off, so Testing Library's automatic afterEach cleanup
// never registers — do it explicitly so renders don't leak between tests.
afterEach(() => {
  cleanup();
});
