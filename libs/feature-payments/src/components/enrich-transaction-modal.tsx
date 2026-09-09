'use client';

import { useEffect, useState } from 'react';
import type { Account, BoardProvider, PaymentMethod, Tag } from '@wib/db';
import {
  Button,
  Field,
  Input,
  Label,
  ResponsiveModal,
  TagInput,
  cn,
} from '@wib/ui';
import { ProviderPicker } from '@wib/feature-providers';
import { enrichBankTransactionAction } from '../lib/bank-transaction-actions';
import type { BankTransactionRow as BankTransactionRowData } from '../lib/bank-sync-queries';

/**
 * "Edit details" on a pending review transaction — stamps a title, notes,
 * account, tags and a provider URL onto it so the payment/expense form
 * inherits them on triage. Same fields an automation can set.
 */
export function EnrichTransactionModal({
  open,
  onOpenChange,
  txn,
  accounts,
  methods,
  tags,
  providers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txn: BankTransactionRowData | null;
  accounts: Account[];
  methods: PaymentMethod[];
  tags: Tag[];
  providers?: BoardProvider[];
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState('');
  const [methodId, setMethodId] = useState('');
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Seed the fields from the transaction each time the modal opens on one.
  const txnId = txn?.id ?? null;
  useEffect(() => {
    if (!open || !txn) return;
    setName(txn.displayName === txn.merchant ? '' : txn.displayName);
    setNotes(txn.notesOverride ?? '');
    setAccountId(txn.accountId ?? '');
    setMethodId(txn.methodId ?? '');
    setTagNames(txn.tags);
    setProviderId(txn.providerId);
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed on open/txn only
  }, [open, txnId]);

  const save = async () => {
    if (!txn) return;
    setBusy(true);
    setError(undefined);
    const res = await enrichBankTransactionAction(txn.id, {
      name,
      notes,
      accountId: accountId || null,
      methodId: methodId || null,
      tags: tagNames,
      providerId: providerId || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save.');
      return;
    }
    onDone();
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit details"
      description="Carried onto the payment or expense when you triage this transaction."
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error ? (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Field>
          <Label htmlFor="enrich-name">Title</Label>
          <Input
            id="enrich-name"
            placeholder={txn?.merchant ?? 'Merchant name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field>
          <Label htmlFor="enrich-notes">Description</Label>
          <textarea
            id="enrich-notes"
            rows={2}
            autoComplete="off"
            data-1p-ignore
            placeholder={txn?.description}
            className="rounded-md border border-line-strong bg-ground px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <ProviderPicker
          value={providerId}
          providers={providers}
          tags={tags.map((t) => ({ name: t.name, color: t.color }))}
          onChange={(id, defaultTagNames) => {
            setProviderId(id);
            if (defaultTagNames.length > 0)
              setTagNames((prev) => {
                const lower = new Set(prev.map((t) => t.toLowerCase()));
                return [
                  ...prev,
                  ...defaultTagNames.filter(
                    (n) => !lower.has(n.toLowerCase()),
                  ),
                ];
              });
          }}
        />

        <Field>
          <Label>Account</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAccountId('')}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                !accountId
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line-strong text-muted hover:text-ink',
              )}
            >
              None
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                  accountId === a.id
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: a.color }}
                />
                {a.name}
              </button>
            ))}
          </div>
        </Field>

        {methods.length > 0 ? (
          <Field>
            <Label htmlFor="enrich-method">Payment method</Label>
            <select
              id="enrich-method"
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="">No method</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted">
              Used only if you turn this into a planned payment.
            </p>
          </Field>
        ) : null}

        <Field>
          <Label>Tags</Label>
          <TagInput
            value={tagNames}
            onChange={setTagNames}
            options={tags.map((t) => ({ name: t.name, color: t.color }))}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
