import { addDays, type PaymentMethodKind } from '@wib/domain';
import type { BoardOccurrence } from './types';

/** Methods that collect automatically — no "remember to pay" nudge needed. */
const AUTO_COLLECTED = new Set<PaymentMethodKind>([
  'direct_debit',
  'credit_card',
]);

/**
 * A "manual" payment is one the user makes themselves — cash, a manual transfer,
 * or no method at all. Direct debits and card payments collect automatically.
 */
export function isManualPayment(
  occ: Pick<BoardOccurrence, 'method'>,
): boolean {
  return !occ.method || !AUTO_COLLECTED.has(occ.method.kind);
}

export type DueLevel = 'overdue' | 'today' | 'soon';

export interface DueAlert {
  level: DueLevel;
  label: string;
}

/**
 * A nudge for a still-unpaid *manual* payment (one you have to make yourself):
 *  `overdue` (past) · `today` · `soon` (within the next 2 days).
 * Auto-collected methods (direct debit / card) never get one.
 */
export function dueAlertFor(
  occ: Pick<BoardOccurrence, 'dueDate' | 'status' | 'method'>,
  today: string,
): DueAlert | null {
  if (occ.status !== 'scheduled') return null;
  if (occ.method && AUTO_COLLECTED.has(occ.method.kind)) return null;
  if (occ.dueDate < today) return { level: 'overdue', label: 'Overdue' };
  if (occ.dueDate === today) return { level: 'today', label: 'Due today' };
  if (occ.dueDate <= addDays(today, 2))
    return { level: 'soon', label: 'Due soon' };
  return null;
}
