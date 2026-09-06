'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, useToast } from '@wib/ui';
import type { BankConnectionView } from '../lib/bank-sync-queries';
import {
  disconnectBankAction,
  startBankConnectionAction,
  syncNowAction,
} from '../lib/bank-connection-actions';

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86_400_000);
}

/**
 * Connect / status / sync-now / disconnect for the user's live Open Banking
 * link (Enable Banking). New transactions land in the Sync-bank inbox for
 * triage, same as a CSV upload — this just keeps them flowing automatically.
 */
export function BankConnectionPanel({
  connection,
  configured,
}: {
  connection: BankConnectionView | null;
  configured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [connecting, setConnecting] = useState(false);

  if (!configured && !connection) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await startBankConnectionAction();
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      toast({ title: "Couldn't start", description: res.error, duration: 6000 });
    } finally {
      setConnecting(false);
    }
  };

  const syncNow = () =>
    startTransition(async () => {
      const res = await syncNowAction();
      toast(
        res.ok
          ? {
              title:
                res.imported === 0
                  ? 'Up to date'
                  : `Pulled in ${res.imported} new transaction${res.imported === 1 ? '' : 's'}`,
              duration: 4000,
            }
          : { title: 'Sync failed', description: res.error, duration: 6000 },
      );
      router.refresh();
    });

  const disconnect = () =>
    startTransition(async () => {
      await disconnectBankAction();
      toast({ title: 'Bank disconnected', duration: 3000 });
      router.refresh();
    });

  // --- No connection yet -------------------------------------------------
  if (!connection) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-line p-4">
        <div>
          <p className="text-sm font-medium text-ink">Connect your bank</p>
          <p className="text-sm text-ink-soft">
            Link your Wise account so new transactions arrive automatically for
            you to review. Access is read-only and renews every ~90 days.
          </p>
        </div>
        <Button type="button" size="sm" disabled={connecting} onClick={connect}>
          {connecting ? 'Starting…' : 'Connect Wise'}
        </Button>
      </div>
    );
  }

  const lastSynced = fmtDate(connection.lastSyncedAt);
  const expires = fmtDate(connection.consentExpiresAt);
  const expiresIn = daysUntil(connection.consentExpiresAt);
  const expiringSoon = expiresIn != null && expiresIn <= 7;

  // --- Pending ---------------------------------------------------------
  if (connection.status === 'pending') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-line p-4">
        <div>
          <p className="text-sm font-medium text-ink">Finish connecting</p>
          <p className="text-sm text-ink-soft">
            Approve access in the window that opened at {connection.aspspName}.
            Didn&apos;t see it?
          </p>
        </div>
        <Button type="button" size="sm" disabled={connecting} onClick={connect}>
          {connecting ? 'Starting…' : 'Try again'}
        </Button>
      </div>
    );
  }

  const needsReconnect =
    connection.status === 'expired' ||
    (connection.status === 'error' && !!connection.lastError);

  // --- Active / error / expired ---------------------------------------
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 ${
        needsReconnect ? 'border-warn/50 bg-warn/5' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            {connection.aspspName}
            {connection.status === 'active' ? (
              <span className="ml-2 text-xs font-normal text-teal">
                Connected
              </span>
            ) : connection.status === 'expired' ? (
              <span className="ml-2 text-xs font-normal text-warn">
                Access expired
              </span>
            ) : (
              <span className="ml-2 text-xs font-normal text-warn">
                Needs attention
              </span>
            )}
          </p>
          {connection.accounts.length > 0 && (
            <p className="text-xs text-muted">
              {connection.accounts
                .map((a) => a.name ?? a.currency)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      {connection.status === 'error' && connection.lastError && (
        <p className="text-xs text-warn">{connection.lastError}</p>
      )}

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
        <div>
          <dt className="inline text-muted">Last synced: </dt>
          <dd className="inline">{lastSynced ?? 'never'}</dd>
        </div>
        {expires && (
          <div>
            <dt className="inline text-muted">Access renews: </dt>
            <dd className={`inline ${expiringSoon ? 'text-warn' : ''}`}>
              {expires}
              {expiresIn != null && expiresIn >= 0 ? ` (${expiresIn}d)` : ''}
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {needsReconnect ? (
          <Button type="button" size="sm" disabled={connecting} onClick={connect}>
            {connecting ? 'Starting…' : 'Reconnect'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={syncNow}
          >
            {pending ? 'Syncing…' : 'Sync now'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={disconnect}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
