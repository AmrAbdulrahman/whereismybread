export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-6 px-4 py-12 text-ink-soft">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Privacy policy</h1>
        <p className="text-sm text-muted">Last updated 5 September 2026</p>
      </header>

      <p>
        Where Is My Bread (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) is a
        personal money-planning tool. This page explains what data the app
        collects, why, and how it&rsquo;s handled. The app is operated by an
        individual as a personal project, not a registered company — if
        that changes, this policy will be updated to reflect it.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          What we collect
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="text-ink">Account details</strong> — your
            name, email address, and a securely hashed password (we never
            store your actual password).
          </li>
          <li>
            <strong className="text-ink">Financial data you enter</strong> —
            payments, budgets, expenses, accounts, banks, and tags you add
            yourself to plan your finances.
          </li>
          <li>
            <strong className="text-ink">Bank transaction data</strong>,
            only if you choose to upload a bank statement — we read the
            transaction descriptions, amounts and dates in the file so you can
            categorize them in the app. The uploaded file is parsed in memory
            and not stored; only the parsed transactions are kept.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Third parties we use
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Vercel — hosting, and file storage for attachments.</li>
          <li>Supabase — the database your data is stored in.</li>
          <li>Resend — sending account emails (verification, password reset).</li>
        </ul>
        <p>
          We don&rsquo;t sell your data, and we don&rsquo;t share it with
          anyone else for advertising or marketing.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Your choices
        </h2>
        <p>
          Imported transactions can be ignored or deleted from the Sync bank
          tab. To request a copy of your data or full account deletion, email
          us (below) — there&rsquo;s no self-service deletion button yet.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Contact
        </h2>
        <p>
          Questions about this policy: privacy@whereismybread.com.
        </p>
      </section>
    </div>
  );
}
