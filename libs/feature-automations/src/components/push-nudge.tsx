'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePush } from './use-push';

const KEY = 'wib:push-nudge-dismissed';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A dismissible prompt to turn on push, shown at the top of the Notifications
 * page when this device *could* get push but hasn't been asked yet. Never
 * blocks: "Not now" snoozes it (per-device, like the subscription itself) for
 * a month. Hidden once push is on, blocked, unsupported, or not relevant.
 */
export function PushNudge({
  vapidPublicKey,
  relevant,
}: {
  vapidPublicKey: string;
  relevant: boolean;
}) {
  const { state, busy, enable } = usePush(vapidPublicKey);
  // Assume snoozed until the effect has read localStorage — avoids a flash.
  const [snoozed, setSnoozed] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(KEY));
      setSnoozed(Number.isFinite(until) && until > Date.now());
    } catch {
      setSnoozed(false);
    }
  }, []);

  if (snoozed || !relevant) return null;
  if (state !== 'off' && state !== 'ios-needs-install') return null;

  const snooze = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // ignore — it just reappears next visit
    }
    setSnoozed(true);
  };

  const onEnable = async () => {
    setError(undefined);
    const res = await enable();
    if (res.ok) {
      snooze(); // a later toggle-off in Settings shouldn't instantly re-nudge
    } else if (
      res.error &&
      res.error !== 'Notification permission was not granted.'
    ) {
      setError(res.error);
    }
    // permission dismissed (not denied) → leave the nudge for another try
  };

  if (state === 'ios-needs-install') {
    return (
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="text-sm font-medium text-ink">Get these on your iPhone</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Add this app to your Home Screen (Share → Add to Home Screen), then
          turn on push in{' '}
          <Link href="/settings" className="text-accent underline">
            Settings
          </Link>
          .
        </p>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={snooze}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
      <p className="text-sm font-medium text-ink">Get notified on this device</p>
      <p className="mt-0.5 text-xs text-ink-soft">
        Turn on push to get an alert when an automation or a bank sync notifies
        you — even with the app closed.
      </p>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={snooze}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEnable}
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ground hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Enabling…' : 'Enable'}
        </button>
      </div>
    </div>
  );
}
