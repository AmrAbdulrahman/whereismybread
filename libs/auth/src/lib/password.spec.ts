import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
    await expect(verifyPassword(hash, 'Tr0ub4dor&3')).resolves.toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same'),
      hashPassword('same'),
    ]);
    expect(a).not.toBe(b);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});
