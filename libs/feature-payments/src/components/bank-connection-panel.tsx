'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, useToast } from '@wib/ui';
import type {
  BankConnectionView,
  ConnectableBankOption,
} from '../lib/bank-sync-queries';
import {
  disconnectBankAction,
  setIgnorePatternsAction,
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

/** The exact local date + time of the last sync, e.g. "5 Sept 2026, 14:07:32". */
function fmtSynced(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86_400_000);
}

/**
 * Connect / status / sync-now / disconnect for one bank's Open Banking link
 * (Enable Banking). New transactions land in that bank's review inbox for
 * triage, same as a CSV upload — this just keeps them flowing automatically.
 */
export function BankConnectionPanel({
  connection,
  connectable,
}: {
  connection: BankConnectionView | null;
  /** The catalog entry for this bank, when it can be auto-connected. */
  connectable: ConnectableBankOption | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [connecting, setConnecting] = useState(false);
  const [patterns, setPatterns] = useState(connection?.ignorePatterns ?? '');
  const [patternsDirty, setPatternsDirty] = useState(false);

  useEffect(() => {
    if (!patternsDirty) setPatterns(connection?.ignorePatterns ?? '');
  }, [connection?.ignorePatterns, patternsDirty]);

  if (!connection && !connectable) return null;

  const connect = async () => {
    if (!connectable) return;
    setConnecting(true);
    try {
      const res = await startBankConnectionAction({
        aspspName: connectable.aspspName,
      });
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      toast({
        title: "Couldn't start",
        description: res.error,
        duration: 6000,
      });
    } finally {
      setConnecting(false);
    }
  };

  const syncNow = () =>
    connection &&
    startTransition(async () => {
      const res = await syncNowAction(connection.id);
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
    connection &&
    startTransition(async () => {
      await disconnectBankAction(connection.id);
      toast({ title: 'Bank disconnected', duration: 3000 });
      router.refresh();
    });

  const savePatterns = () =>
    connection &&
    startTransition(async () => {
      const res = await setIgnorePatternsAction(connection.id, patterns);
      setPatternsDirty(false);
      toast({
        title: 'Ignore rules saved',
        description:
          res.ignored && res.ignored > 0
            ? `${res.ignored} matching transaction${res.ignored === 1 ? '' : 's'} moved to ignored.`
            : undefined,
        duration: 3500,
      });
      router.refresh();
    });

  const label = connectable?.label ?? connection?.aspspName ?? 'bank';

  // --- Not connected yet ----------------------------------------------
  if (!connection) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-line p-4">
        <div>
          <p className="text-sm font-medium text-ink">Connect {label}</p>
          <p className="text-sm text-ink-soft">
            Link your {label} account so new transactions arrive automatically
            for you to review. Access is read-only and renews about every 180
            days.
          </p>
        </div>
        <Button type="button" size="sm" disabled={connecting} onClick={connect}>
          {connecting ? 'Starting…' : `Connect ${label}`}
        </Button>
      </div>
    );
  }

  const lastSynced = fmtSynced(connection.lastSyncedAt);
  const expires = fmtDate(connection.consentExpiresAt);
  const expiresIn = daysUntil(connection.consentExpiresAt);
  const expiringSoon = expiresIn != null && expiresIn <= 7;

  // --- Pending -------------------------------------------------------
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

  // --- Active / error / expired -------------------------------------
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
              {connection.accounts.map((a) => a.name ?? a.currency).join(' · ')}
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
          <Button
            type="button"
            size="sm"
            disabled={connecting}
            onClick={connect}
          >
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

      <details className="group border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer list-none text-xs font-medium text-ink-soft [&::-webkit-details-marker]:hidden">
          Auto-ignore rules
          <span className="ml-1 text-muted group-open:hidden">▸</span>
          <span className="ml-1 hidden text-muted group-open:inline">▾</span>
        </summary>

        <div className="mt-3 flex flex-col gap-1.5">
          <p className="text-[11px] text-muted">
            One case-insensitive regex per line, matched against a
            transaction&apos;s description and type. Matches come in already
            ignored. <code>#</code> starts a comment.
          </p>
          <textarea
            aria-label="Auto-ignore rules"
            rows={5}
            spellCheck={false}
            value={patterns}
            onChange={(e) => {
              setPatterns(e.target.value);
              setPatternsDirty(true);
            }}
            className="rounded-md border border-line-strong bg-ground px-3 py-2 font-mono text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {patternsDirty && (
            <div>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={savePatterns}
              >
                {pending ? 'Saving…' : 'Save rules'}
              </Button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
