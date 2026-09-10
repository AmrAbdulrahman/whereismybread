import { z } from 'zod';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const amount = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .refine(
    (v) => Number.isFinite(Number(v.replace(/[, ]/g, ''))),
    'Not a number',
  )
  .refine((v) => Number(v.replace(/[, ]/g, '')) > 0, 'Must be more than zero');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/** The "person" — name, email, optional photo. Shared by form + action. */
export const personFormSchema = z.object({
  name: z.string().trim().min(1, 'Give them a name').max(80),
  email,
  /** A downscaled `data:image/...` URI, or null. */
  photoUrl: z.preprocess(
    blankToNull,
    z
      .string()
      .max(400_000)
      .startsWith('data:image/', 'That does not look like an image')
      .nullable()
      .default(null),
  ),
});
export type PersonFormValues = z.input<typeof personFormSchema>;

/** A debt: who, which way, how much, what for. */
export const debtFormSchema = z.object({
  personId: z.string().uuid('Pick a person'),
  direction: z.enum(['they_owe', 'i_owe']).default('they_owe'),
  amount,
  currency: z.string().trim().toUpperCase().length(3).default('EUR'),
  description: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().max(120).default(''),
  ),
  notes: z.preprocess(
    blankToNull,
    z.string().trim().max(1000).nullable().default(null),
  ),
});
export type DebtFormValues = z.input<typeof debtFormSchema>;

/** One repayment against a debt (currency is the debt's, not chosen here). */
export const repaymentFormSchema = z.object({
  amount,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  note: z.preprocess(
    blankToNull,
    z.string().trim().max(200).nullable().default(null),
  ),
});
export type RepaymentFormValues = z.input<typeof repaymentFormSchema>;

// --- external OTP flow ---

export const otpRequestSchema = z.object({ email });
export type OtpRequestValues = z.input<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type OtpVerifyValues = z.input<typeof otpVerifySchema>;
