import 'server-only';
import { sendDebtUpdateEmail } from '@wib/auth/server';
import { serverEnv } from '@wib/config';
import { getSharedPersonDebts, type Debt, type DebtPerson } from '@wib/db';
import {
  debtHeadlineForOther,
  debtProgress,
  formatDebtAmount,
  goldUnitFor,
  type DebtDenomination,
} from '@wib/domain';

function denomOf(d: Debt): DebtDenomination {
  if (d.denomKind === 'gold') {
    const goldType = d.goldType ?? 'k21';
    return {
      kind: 'gold',
      goldType,
      goldLabel: d.goldLabel,
      unit: goldUnitFor(goldType, d.goldUnit),
    };
  }
  return { kind: 'money', currency: d.currency };
}

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
      const denom = denomOf(d);
      const head = debtHeadlineForOther(d.direction, ownerName);
      const total = formatDebtAmount(d.principalMinor, denom);
      const label = d.description ? ` for "${d.description}"` : '';
      if (p.settled) return `${head} ${total}${label} — settled ✓`;
      return `${head} ${total}${label} — ${formatDebtAmount(
        p.paidMinor,
        denom,
      )} repaid, ${formatDebtAmount(p.remainingMinor, denom)} left`;
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
