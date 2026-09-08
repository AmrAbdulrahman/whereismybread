'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner, useToast } from '@wib/ui';
import {
  deletePushSubscriptionAction,
  savePushSubscriptionAction,
  updateNotificationPrefsAction,
} from '../lib/actions';

/** VAPID public key (base64url) → the byte array `pushManager.subscribe` wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState =
  | 'loading'
  | 'unsupported'
  | 'ios-needs-install'
  | 'denied'
  | 'off'
  | 'on';

function Row({
  title,
  hint,
  control,
}: {
  title: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

function Check({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 accent-accent disabled:opacity-40"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function NotificationsSettings({
  vapidPublicKey,
  notifyEmail: initialEmail,
  notifySyncSummary: initialSync,
}: {
  vapidPublicKey: string;
  notifyEmail: boolean;
  notifySyncSummary: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [push, setPush] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  const [notifyEmail, setNotifyEmail] = useState(initialEmail);
  const [notifySyncSummary, setNotifySyncSummary] = useState(initialSync);
  const [, startTransition] = useTransition();

  const configured = vapidPublicKey.length > 0;

  const refreshPushState = useCallback(async () => {
    if (!configured) return setPush('unsupported');
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    if (!hasSW || !hasPush) {
      // iOS < 16.4, or (16.4+) Safari in a normal tab — push there only works
      // once the app is installed to the Home Screen.
      const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      return setPush(iOS ? 'ios-needs-install' : 'unsupported');
    }
    if (Notification.permission === 'denied') return setPush('denied');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? 'on' : 'off');
    } catch {
      setPush('off');
    }
  }, [configured]);

  useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  const enablePush = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPush(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      const res = await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent.slice(0, 500),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        throw new Error(res.error ?? 'Could not save subscription');
      }
      setPush('on');
      toast({
        title: 'Push notifications on',
        description: 'This device will get alerts even when the tab is closed.',
        tone: 'success',
      });
    } catch (err) {
      toast({
        title: 'Could not enable push',
        description: err instanceof Error ? err.message : 'Please try again.',
        tone: 'danger',
      });
      void refreshPushState();
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setPush('off');
      toast({ title: 'Push notifications off for this device' });
    } catch {
      toast({ title: 'Could not turn push off', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = (patch: {
    notifyEmail: boolean;
    notifySyncSummary: boolean;
  }) => {
    startTransition(async () => {
      const res = await updateNotificationPrefsAction(patch);
      if (res.ok) router.refresh();
      else toast({ title: 'Could not save', tone: 'danger' });
    });
  };

  const pushControl = () => {
    if (push === 'loading')
      return <Spinner />;
    if (push === 'on' || push === 'off')
      return (
        <button
          type="button"
          disabled={busy}
          onClick={push === 'on' ? disablePush : enablePush}
          className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {busy ? '…' : push === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      );
    return null;
  };

  const pushHint = (): string => {
    switch (push) {
      case 'unsupported':
        return configured
          ? 'This browser does not support push notifications.'
          : 'Push notifications are not configured for this deployment.';
      case 'ios-needs-install':
        return 'On iPhone/iPad, add this app to your Home Screen first, then reopen this page.';
      case 'denied':
        return 'Blocked in your browser settings — allow notifications for this site to turn it on.';
      case 'on':
        return 'Getting alerts on this device. Also shown on the Notifications page.';
      default:
        return 'Get an OS notification on this device when an automation or a bank sync notifies you.';
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Row
        title="Push notifications"
        hint={pushHint()}
        control={pushControl()}
      />
      <Row
        title="Email"
        hint="Also email me when an automation’s “Send notification” action fires."
        control={
          <Check
            label="Notification emails"
            checked={notifyEmail}
            onChange={(next) => {
              setNotifyEmail(next);
              savePrefs({ notifyEmail: next, notifySyncSummary });
            }}
          />
        }
      />
      <Row
        title="Bank sync summaries"
        hint="Notify me when a bank sync finishes importing new transactions."
        control={
          <Check
            label="Bank sync summaries"
            checked={notifySyncSummary}
            onChange={(next) => {
              setNotifySyncSummary(next);
              savePrefs({ notifyEmail, notifySyncSummary: next });
            }}
          />
        }
      />
    </div>
  );
}
