import {
  changePasswordSchema,
  fieldErrors,
  signInSchema,
  signUpSchema,
} from './schemas';

describe('auth schemas', () => {
  it('normalises the email and trims the name on signup', () => {
    const parsed = signUpSchema.parse({
      name: '  Amr  ',
      email: '  Amr@Example.COM ',
      password: 'a-good-password',
    });
    expect(parsed).toEqual({
      name: 'Amr',
      email: 'amr@example.com',
      password: 'a-good-password',
    });
  });

  it('rejects short passwords with a helpful message', () => {
    const result = signUpSchema.safeParse({
      name: 'A',
      email: 'a@b.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).password?.[0]).toMatch(/8 characters/);
    }
  });

  it('signIn only needs a non-empty password', () => {
    expect(
      signInSchema.safeParse({ email: 'a@b.com', password: 'x' }).success,
    ).toBe(true);
    expect(
      signInSchema.safeParse({ email: 'a@b.com', password: '' }).success,
    ).toBe(false);
  });

  it('changePassword requires 8+ chars for the new password', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'x',
        newPassword: 'tiny',
      }).success,
    ).toBe(false);
  });
});
