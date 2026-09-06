export const metadata = { title: 'Terms & Conditions' };

export default function TermsAndConditionsPage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-6 px-4 py-12 text-ink-soft">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Terms &amp; conditions</h1>
        <p className="text-sm text-muted">Last updated 5 September 2026</p>
      </header>

      <p>
        Where Is My Bread (&ldquo;the app&rdquo;) is a personal
        money-planning tool, built and operated by an individual as a
        personal project. Using it means agreeing to the terms below.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          What the app does
        </h2>
        <p>
          It helps you track payments, budgets, and expenses you enter
          yourself, and — if you choose to upload a bank statement — helps you
          categorize the transactions in it. It never connects to your bank or
          initiates a payment, transfer, or any change to a bank account.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          No financial advice
        </h2>
        <p>
          The app is a planning and organization tool, not a financial
          adviser. Nothing it shows — budgets, totals, projections — is
          financial, tax, or investment advice. You&rsquo;re responsible for
          your own financial decisions.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Provided as-is
        </h2>
        <p>
          This is a personal project, not a commercial product with a
          service-level guarantee. It&rsquo;s provided &ldquo;as is&rdquo;,
          without warranty of any kind. We aim for it to be reliable and
          secure, but can&rsquo;t promise uninterrupted availability or that
          it&rsquo;s free of bugs.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Bank statements
        </h2>
        <p>
          Uploading a bank statement is entirely optional and under your
          control. The file is parsed in memory and not stored — only the
          parsed transactions are kept, and you can ignore or delete them at
          any time. See our{' '}
          <a href="/privacy-policy" className="text-accent underline">
            Privacy policy
          </a>{' '}
          for how that data is protected.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Changes
        </h2>
        <p>
          These terms may be updated as the app changes. Continued use after
          an update means you accept the revised terms.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Contact
        </h2>
        <p>Questions: privacy@whereismybread.com.</p>
      </section>
    </div>
  );
}
