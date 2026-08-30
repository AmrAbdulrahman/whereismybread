import { clientEnv } from './env.client';

describe('clientEnv', () => {
  it('exposes a BUILD_ID, defaulting to "dev"', () => {
    expect(typeof clientEnv.BUILD_ID).toBe('string');
    expect(clientEnv.BUILD_ID.length).toBeGreaterThan(0);
  });
});
