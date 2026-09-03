import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { money, toMajor } from '@wib/domain';
import { ThemeToggle } from '@wib/ui';
import { CheckForUpdatesButton } from '../../_components/update-prompt';
import { PasswordForm } from './_password-form';
import { PreferencesForm } from './_preferences-form';
import { ProfileForm } from './_profile-form';
import { SignOutButton } from './_sign-out';
import { VerifyEmailNotice } from './_verify-notice';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-ink-soft">Your profile and how you sign in.</p>
      </header>

      {user.emailVerified ? null : <VerifyEmailNotice />}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold">Profile</h2>
        <ProfileForm name={user.name} email={user.email} />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Preferences</h2>
        <PreferencesForm
          timezone={user.timezone}
          timezoneAuto={user.timezoneAuto}
          defaultCurrency={user.defaultCurrency}
          displayCurrency={user.displayCurrency}
          incomeMode={user.incomeMode}
          incomeCurrency={user.incomeCurrency}
          income={
            user.incomeMinor
              ? String(toMajor(money(user.incomeMinor, user.incomeCurrency)))
              : ''
          }
          hourlyRate={
            user.hourlyRateMinor
              ? String(
                  toMajor(money(user.hourlyRateMinor, user.incomeCurrency)),
                )
              : ''
          }
          monthlyHours={user.monthlyHours ? String(user.monthlyHours) : ''}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Appearance</h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-soft">Theme</p>
          <ThemeToggle />
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Password</h2>
        <PasswordForm />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold">Updates</h2>
        <CheckForUpdatesButton />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <SignOutButton />
      </section>
    </div>
  );
}
