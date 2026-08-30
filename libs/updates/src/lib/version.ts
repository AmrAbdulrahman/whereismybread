import { clientEnv } from '@wmm/config';

/** Response shape of `GET /api/version`. */
export interface VersionInfo {
  /** Commit SHA, or the Vercel deployment id when the SHA is unavailable. */
  buildId: string;
  commit: string | null;
  /** ISO timestamp the deployment was built. */
  builtAt: string;
}

/** The build id baked into the currently-running bundle. `"dev"` locally. */
export const CURRENT_BUILD_ID: string = clientEnv.BUILD_ID;
