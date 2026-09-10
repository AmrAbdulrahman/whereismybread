import 'server-only';
import { sendDebtUpdateEmail } from '@wib/auth/server';
import { serverEnv } from '@wib/config';
import { getSharedPersonDebts, type DebtPerson } from '@wib/db';
import {
  debtHeadlineForOther,
  debtIsSettled,
  denomBalances,
  formatDebtAmount,
} from '@wib/domain';
import { denomOf } from './queries';

/**
 * Email the other party a fresh summary of every debt they have with the user.
 * Fired after a debt is created / edited, a repayment is recorded, or a debt is
 * settled / reopened. Best-effort — never throws into the caller.
 *
 * Each debt contributes one line per denomination it's owed in: its outstanding
 * balance against the amount owed, or a settled tick.
 */
export async function notifyPersonOfDebts(
  person: Pick<DebtPerson, 'name' | 'email' | 'shareId'>,
  ownerName: string,
  intro: string,
): Promise<void> {
  try {
    const bundle = await getSharedPersonDebts(person.shareId);
    if (!bundle) return;
    const lines = bundle.debts.flatMap((d) => {
      const balances = denomBalances(
        d.lines.map((l) => ({
          denom: denomOf(l),
          amountMinor: l.amountMinor,
        })),
        d.entries.map((e) => ({
          denom: denomOf(e),
          amountMinor: e.amountMinor,
        })),
      );
      if (balances.length === 0) return [];
      const head = debtHeadlineForOther(d.direction, ownerName);
      const label = d.description ? ` for "${d.description}"` : '';
      if (debtIsSettled(balances, d.settledAt)) {
        return [`${head}${label} — settled ✓`];
      }
      return balances.map((b) =>
        b.outstandingMinor <= 0
          ? `${head}${label}: ${formatDebtAmount(b.owedMinor, b.denom)} — settled ✓`
          : `${head}${label}: ${formatDebtAmount(
              b.outstandingMinor,
              b.denom,
            )} left of ${formatDebtAmount(b.owedMinor, b.denom)}`,
      );
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
