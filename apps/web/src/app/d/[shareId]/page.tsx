import { notFound } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { DebtOtpForm, SharedDebtView } from '@wib/feature-debts';
import {
  getDebtPersonByShareId,
  getSharedView,
  hasDebtGrant,
} from '@wib/feature-debts/server';

export const metadata = { title: 'Shared debt' };
export const dynamic = 'force-dynamic';

export default async function SharedDebtPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shareId)) {
    notFound();
  }
  const person = await getDebtPersonByShareId(shareId);
  if (!person) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === person.userId;
  const unlocked = isOwner || (await hasDebtGrant(person.id));

  if (!unlocked) return <DebtOtpForm shareId={shareId} />;

  const view = await getSharedView(shareId);
  if (!view) notFound();
  return <SharedDebtView view={view} preview={isOwner} />;
}
