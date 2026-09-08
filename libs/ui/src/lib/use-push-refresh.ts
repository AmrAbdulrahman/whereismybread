'use client';

import { useEffect, useRef } from 'react';

/**
 * Runs `onRefresh` whenever the Web Push service worker (`/sw.js`) tells an
 * open tab that a push just arrived — so a screen showing payments / insights
 * reflects a background sync or a fired automation without a manual reload.
 *
 * No-op where service workers are unavailable or push was never enabled (the
 * worker only broadcasts once a subscription exists). The callback is read
 * through a ref, so passing a fresh closure each render is fine.
 */
export function usePushRefresh(onRefresh: () => void): void {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'wib:push') cb.current();
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () =>
      navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}
