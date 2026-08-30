'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENT_BUILD_ID, type VersionInfo } from './version';

const POLL_INTERVAL_MS = 15 * 60 * 1000;

export interface UpdateCheck {
  /** A newer deployment is live than the one this bundle came from. */
  updateAvailable: boolean;
  checking: boolean;
  lastChecked: Date | null;
  latest: VersionInfo | null;
  /** Check `/api/version` now (the "Check for updates" action). */
  checkNow: () => Promise<void>;
  /** Hard-reload the page so the new bundle loads. */
  applyUpdate: () => void;
}

/**
 * Compares the running bundle's build id against whatever `/api/version`
 * currently reports (that route always runs on the live deployment, so its
 * answer is by definition the latest). Checks on mount, every 15 minutes, and
 * whenever the tab becomes visible again.
 */
export function useUpdateCheck(endpoint = '/api/version'): UpdateCheck {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latest, setLatest] = useState<VersionInfo | null>(null);
  const inFlight = useRef(false);

  const checkNow = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) return;
      const info = (await res.json()) as VersionInfo;
      setLatest(info);
      setLastChecked(new Date());
      // Never nag in local dev, where there is no real deployment to compare to.
      setUpdateAvailable(
        CURRENT_BUILD_ID !== 'dev' && info.buildId !== CURRENT_BUILD_ID,
      );
    } catch {
      // offline or transient — leave state as-is
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void checkNow();
    const interval = setInterval(() => void checkNow(), POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkNow]);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    updateAvailable,
    checking,
    lastChecked,
    latest,
    checkNow,
    applyUpdate,
  };
}
