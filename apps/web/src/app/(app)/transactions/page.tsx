import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { todayIn } from '@wib/domain';
import { BankTransactionTriage, StatementUpload } from '@wib/feature-payments';
import {
  getBankTransactionsData,
  getBoardData,
  getBudgetsData,
} from '@wib/feature-payments/server';

export const metadata = { title: 'Sync bank' };
export const dynamic = 'force-dynamic';

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default async function TransactionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { context, board } = await getBoardData();
  const budgets = await getBudgetsData();
  const { pending, imports } = await getBankTransactionsData();
  const lastImport = imports[0];

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sync bank</h1>
        <p className="text-ink-soft">
          Upload a bank statement — new transactions come in for you to log as
          an expense, turn into a recurring payment, or ignore.
        </p>
      </header>

      <StatementUpload defaultCurrency={user.defaultCurrency} />

      {lastImport ? (
        <p className="text-xs text-muted">
          Last import: {lastImport.source} · {fmt(lastImport.createdAt)} ·{' '}
          {lastImport.rowsImported} new
          {lastImport.rowsSkipped > 0
            ? `, ${lastImport.rowsSkipped} already seen`
            : ''}
          {fmt(lastImport.periodStart) && fmt(lastImport.periodEnd)
            ? ` · covered ${fmt(lastImport.periodStart)}–${fmt(lastImport.periodEnd)}`
            : ''}
        </p>
      ) : null}

      <BankTransactionTriage
        pending={pending}
        context={context}
        budgets={budgets}
        today={todayIn(user.timezone)}
        defaultCurrency={user.defaultCurrency}
        rates={board.rates}
      />
    </div>
  );
}
