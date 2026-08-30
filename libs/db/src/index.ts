export { getDb, getSql, type Db } from './lib/client';
export { checkDatabase, type DbHealth } from './lib/health';
export * as schema from './lib/schema/index';
export type { User, NewUser } from './lib/schema/users';

export {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserProfile,
  updateUserPassword,
  markEmailVerified,
} from './lib/repositories/users';

export {
  createPasswordResetToken,
  findLivePasswordResetToken,
  markPasswordResetTokenUsed,
  deleteUserPasswordResetTokens,
  createEmailVerificationToken,
  findLiveEmailVerificationToken,
  markEmailVerificationTokenUsed,
  deleteUserEmailVerificationTokens,
} from './lib/repositories/auth-tokens';
