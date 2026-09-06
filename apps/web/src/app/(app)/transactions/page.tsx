import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { todayIn } from '@wib/domain';
import {
  BankConnectionPanel,
  BankTransactionTriage,
  StatementUpload,
} from '@wib/feature-payments';
import {
  getBankConnectionData,
  getBankTransactionsData,
  getBoardData,
  getBudgetsData,
  isEnableBankingConfigured,
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

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { bank } = await searchParams;
  const { context, board } = await getBoardData();
  const budgets = await getBudgetsData();
  const { pending, imports } = await getBankTransactionsData();
  const connection = await getBankConnectionData();
  const bankConfigured = isEnableBankingConfigured();
  const lastImport = imports[0];

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sync bank</h1>
        <p className="text-ink-soft">
          Connect your bank for automatic updates, or upload a statement — new
          transactions come in for you to log as an expense, turn into a
          recurring payment, or ignore.
        </p>
      </header>

      {bank === 'connected' ? (
        <p className="rounded-lg border border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal">
          Bank connected. New transactions will appear below.
        </p>
      ) : bank === 'error' ? (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">
          Couldn&apos;t finish connecting your bank. Try again from the panel
          below.
        </p>
      ) : null}

      {(bankConfigured || connection) && (
        <BankConnectionPanel
          connection={connection}
          configured={bankConfigured}
        />
      )}

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
