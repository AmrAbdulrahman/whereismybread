import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { startOfMonth, todayIn } from '@wib/domain';
import { PaymentsView } from '@wib/feature-payments';
import { getBoardData } from '@wib/feature-payments/server';

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
  const view = sp.view === 'calendar' ? 'calendar' : 'list';
  const today = todayIn(user.timezone);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '')
    ? `${sp.month}-01`
    : startOfMonth(today);

  const { context, board } = await getBoardData({ month });

  return (
    <PaymentsView
      board={board}
      methods={context.methods}
      accounts={context.accounts}
      banks={context.banks}
      recipientMethods={context.recipientMethods}
      tags={context.tags}
      defaultCurrency={user.defaultCurrency}
      view={view}
      month={month}
    />
  );
}
