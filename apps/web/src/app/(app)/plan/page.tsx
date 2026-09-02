import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { addMonths, endOfMonth, startOfMonth, todayIn } from '@wib/domain';
import { PaymentsView } from '@wib/feature-payments';
import {
  getPaymentBoard,
  getPaymentsContext,
} from '@wib/feature-payments/server';

export const metadata = { title: 'Plan' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'calendar';
  const today = todayIn(user.timezone);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '')
    ? `${sp.month}-01`
    : startOfMonth(today);

  // A single window that covers both the upcoming list and the visible month.
  const from =
    month < startOfMonth(today) ? startOfMonth(month) : startOfMonth(today);
  const farByMonth = endOfMonth(addMonths(month, 1));
  const farByToday = endOfMonth(addMonths(today, 3));
  const to = farByMonth > farByToday ? farByMonth : farByToday;

  const ctx = await getPaymentsContext();
  const board = await getPaymentBoard(ctx, { from, to });

  return (
    <PaymentsView
      board={board}
      methods={ctx.methods}
      accounts={ctx.accounts}
      banks={ctx.banks}
      recipientMethods={ctx.recipientMethods}
      tags={ctx.tags}
      defaultCurrency={user.defaultCurrency}
      view={view}
      month={month}
    />
  );
}
