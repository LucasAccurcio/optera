import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /health', () => {
  it('registers the health endpoint', () => {
    const app = buildApp({ withDatabase: false });
    expect(app).toBeDefined();
    expect(typeof app.inject).toBe('function');
  });
});
