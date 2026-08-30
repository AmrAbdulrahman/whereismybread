export { getDb, getSql, type Db } from './lib/client';
export { checkDatabase, type DbHealth } from './lib/health';
export * as schema from './lib/schema/index';
export type { User, NewUser } from './lib/schema/users';
