import { getCurrentUser } from './session';

describe('getCurrentUser (Phase 0 stub)', () => {
  it('resolves to null until Auth.js lands in Phase 1', async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
