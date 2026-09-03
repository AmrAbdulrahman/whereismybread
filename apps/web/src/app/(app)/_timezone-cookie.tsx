'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const COOKIE = 'wib-tz';

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m?.[1] != null ? decodeURIComponent(m[1]) : null;
}

/**
 * Keeps a `wib-tz` cookie in sync with the browser's IANA zone, so the server
 * can resolve "today" for users who haven't set an explicit override. Only
 * refreshes the page when the zone actually changed (first visit, or travel).
 */
export function TimezoneCookie({ auto }: { auto: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!auto) return;
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz || readCookie(COOKIE) === tz) return;
    document.cookie = `${COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [auto, router]);
  return null;
}
