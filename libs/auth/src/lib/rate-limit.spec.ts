import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  it('allows up to the limit then blocks with a retry hint', () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', () => {
    expect(rateLimit(`a:${Math.random()}`, 1, 60_000).ok).toBe(true);
    expect(rateLimit(`b:${Math.random()}`, 1, 60_000).ok).toBe(true);
  });
});
