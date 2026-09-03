import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import {
  LabelManager,
  deleteAccountAction,
  listAccountsAction,
  saveAccountAction,
} from '@wib/feature-payments';
import { getAccounts } from '@wib/feature-payments/server';

export const metadata = { title: 'Accounts' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accounts = await getAccounts();
  return (
    <LabelManager
      title="Accounts"
      noun="account"
      description="What a payment is for — a company, a household bill group, taxes. Deleting one just unlinks it from its payments."
      namePlaceholder="Company, Utilities, Taxes…"
      items={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        paymentCount: a.paymentCount,
      }))}
      onSave={saveAccountAction}
      onDelete={deleteAccountAction}
      onRefresh={listAccountsAction}
    />
  );
}
