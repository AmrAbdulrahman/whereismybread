import type { PaymentOverrides } from '@wib/db';
import type { EditablePayment } from './types';

/**
 * Fold a per-occurrence override onto a payment's editable defaults, so the
 * edit form opens showing what that specific month actually charges. Shared by
 * the plan board (`payments-view`) and the Insights page, which both open the
 * same edit modal from an occurrence.
 */
export function applyOverride(
  base: EditablePayment,
  ov: PaymentOverrides,
): EditablePayment {
  return {
    ...base,
    name: ov.name ?? base.name,
    amount:
      ov.amountMinor != null ? (ov.amountMinor / 100).toFixed(2) : base.amount,
    defaultUnits: ov.units != null ? String(ov.units) : base.defaultUnits,
    lineItems:
      'lineItems' in ov && ov.lineItems
        ? ov.lineItems.map((li) => ({
            id: li.id,
            name: li.name,
            value: (li.valueMinor / 100).toFixed(2),
            currency: li.currency,
            iconKey: li.iconKey,
            logoUrl: li.logoUrl,
            color: li.color,
          }))
        : base.lineItems,
    currency: ov.currency ?? base.currency,
    methodId: 'methodId' in ov ? (ov.methodId ?? null) : base.methodId,
    accountId: 'accountId' in ov ? (ov.accountId ?? null) : base.accountId,
    bankId: 'bankId' in ov ? (ov.bankId ?? null) : base.bankId,
    recipientMethodId:
      'recipientMethodId' in ov
        ? (ov.recipientMethodId ?? null)
        : base.recipientMethodId,
    notes: 'notes' in ov ? (ov.notes ?? null) : base.notes,
  };
}
