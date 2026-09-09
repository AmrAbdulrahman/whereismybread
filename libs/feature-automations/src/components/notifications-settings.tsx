'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner, useToast } from '@wib/ui';
import { updateNotificationPrefsAction } from '../lib/actions';
import { usePush } from './use-push';

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
  const { state: push, busy, enable, disable } = usePush(vapidPublicKey);

  const [notifyEmail, setNotifyEmail] = useState(initialEmail);
  const [notifySyncSummary, setNotifySyncSummary] = useState(initialSync);
  const [, startTransition] = useTransition();

  const onEnable = async () => {
    const res = await enable();
    if (res.ok) {
      toast({
        title: 'Push notifications on',
        description: 'This device will get alerts even when the tab is closed.',
        tone: 'success',
      });
    } else if (res.error && res.error !== 'Notification permission was not granted.') {
      toast({
        title: 'Could not enable push',
        description: res.error,
        tone: 'danger',
      });
    }
  };

  const onDisable = async () => {
    const res = await disable();
    toast(
      res.ok
        ? { title: 'Push notifications off for this device' }
        : { title: 'Could not turn push off', tone: 'danger' },
    );
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
    if (push === 'loading') return <Spinner />;
    if (push === 'on' || push === 'off')
      return (
        <button
          type="button"
          disabled={busy}
          onClick={push === 'on' ? onDisable : onEnable}
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
        return vapidPublicKey.length > 0
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
      <Row title="Push notifications" hint={pushHint()} control={pushControl()} />
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
