import 'server-only';
import { sendDebtUpdateEmail } from '@wib/auth/server';
import { serverEnv } from '@wib/config';
import { getSharedPersonDebts, type DebtPerson } from '@wib/db';
import {
  debtHeadlineForOther,
  debtProgress,
  formatMoney,
  money,
} from '@wib/domain';

/**
 * Email the other party a fresh summary of every debt they have with the user.
 * Fired after a debt is created, a repayment is recorded, or a debt is
 * settled / reopened. Best-effort — never throws into the caller.
 */
export async function notifyPersonOfDebts(
  person: Pick<DebtPerson, 'name' | 'email' | 'shareId'>,
  ownerName: string,
  intro: string,
): Promise<void> {
  try {
    const bundle = await getSharedPersonDebts(person.shareId);
    if (!bundle) return;
    const lines = bundle.debts.map((d) => {
      const paidMinor = d.entries.reduce((s, e) => s + e.amountMinor, 0);
      const p = debtProgress({ principalMinor: d.principalMinor, paidMinor });
      const head = debtHeadlineForOther(d.direction, ownerName);
      const total = formatMoney(money(d.principalMinor, d.currency));
      const label = d.description ? ` for "${d.description}"` : '';
      if (p.settled) return `${head} ${total}${label} — settled ✓`;
      return `${head} ${total}${label} — ${formatMoney(
        money(p.paidMinor, d.currency),
      )} repaid, ${formatMoney(money(p.remainingMinor, d.currency))} left`;
    });
    if (lines.length === 0) return;
    await sendDebtUpdateEmail(person.email, {
      personName: person.name,
      ownerName,
      intro,
      lines,
      href: `${serverEnv().APP_URL}/d/${person.shareId}`,
    });
  } catch (error) {
    console.error('[debts] notify failed', error);
  }
}
