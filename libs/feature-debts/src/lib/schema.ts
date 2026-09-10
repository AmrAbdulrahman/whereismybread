import { z } from 'zod';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A file already uploaded to Blob, staged on the form until its row is saved. */
export const attachmentDraftSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().nonnegative(),
  url: z.string().url().max(2048),
  pathname: z.string().trim().min(1).max(1024),
});
export type AttachmentDraftValue = z.input<typeof attachmentDraftSchema>;

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

/**
 * The denomination shape shared by the debt-edit form and every line of the
 * multi-line create form. `amount` is money minor units or a gold quantity,
 * parsed per `denomKind` in the action.
 */
const denomLineShape = {
  amount,
  denomKind: z.enum(['money', 'gold']).default('money'),
  currency: z.string().trim().toUpperCase().length(3).default('EUR'),
  /** A `@wib/domain` gold catalogue key, or `'custom'`. */
  goldType: z.string().trim().min(1).max(40).default('k21'),
  goldLabel: z.preprocess(
    blankToNull,
    z.string().trim().max(60).nullable().default(null),
  ),
  goldUnit: z.enum(['g', 'piece']).default('g'),
} as const;

/** Custom gold needs a label — applied after `.object()` (which returns a plain schema). */
const customGoldNeedsLabel = (v: {
  denomKind: string;
  goldType: string;
  goldLabel: string | null;
}) =>
  v.denomKind !== 'gold' ||
  v.goldType !== 'custom' ||
  (v.goldLabel != null && v.goldLabel.length > 0);
const customGoldMsg = { path: ['goldLabel'], message: 'Name the gold type' };

/** A debt: who, which way, how much (money or gold), what for. Edit path. */
export const debtFormSchema = z
  .object({
    personId: z.string().uuid('Pick a person'),
    direction: z.enum(['they_owe', 'i_owe']).default('i_owe'),
    ...denomLineShape,
    incurredOn: z.string().regex(ISO_DATE, 'Pick a date'),
    description: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim() : v),
      z.string().max(120).default(''),
    ),
    notes: z.preprocess(
      blankToNull,
      z.string().trim().max(1000).nullable().default(null),
    ),
    attachments: z.array(attachmentDraftSchema).max(20).default([]),
  })
  .refine(customGoldNeedsLabel, customGoldMsg);
export type DebtFormValues = z.input<typeof debtFormSchema>;

/** One line of the multi-line "new debts" form — its own note + date. */
export const debtLineSchema = z
  .object({
    ...denomLineShape,
    /** → the created debt's `description`. */
    note: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim() : v),
      z.string().max(120).default(''),
    ),
    occurredOn: z.string().regex(ISO_DATE, 'Pick a date'),
  })
  .refine(customGoldNeedsLabel, customGoldMsg);
export type DebtLineValue = z.input<typeof debtLineSchema>;

/** Create several debts with one person in one go. */
export const newDebtsSchema = z.object({
  personId: z.string().uuid('Pick a person'),
  direction: z.enum(['they_owe', 'i_owe']).default('they_owe'),
  lines: z.array(debtLineSchema).min(1, 'Add at least one').max(20),
});
export type NewDebtsValues = z.input<typeof newDebtsSchema>;

/** One repayment against a debt (currency is the debt's, not chosen here). */
export const repaymentFormSchema = z.object({
  amount,
  occurredOn: z.string().regex(ISO_DATE, 'Pick a date'),
  note: z.preprocess(
    blankToNull,
    z.string().trim().max(200).nullable().default(null),
  ),
  attachments: z.array(attachmentDraftSchema).max(20).default([]),
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
