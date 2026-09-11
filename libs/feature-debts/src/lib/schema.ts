import { z } from 'zod';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const trimmed = (v: unknown): unknown => (typeof v === 'string' ? v.trim() : v);

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

/** Like `amount`, but optional — blank stays `null` rather than failing. */
const optionalAmount = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .refine(
      (v) => Number.isFinite(Number(v.replace(/[, ]/g, ''))),
      'Not a number',
    )
    .refine((v) => Number(v.replace(/[, ]/g, '')) > 0, 'Must be more than zero')
    .nullable()
    .default(null),
);

/**
 * What the whole debt was worth when lent — always money, optional. Shared by
 * the create and edit-metadata forms.
 */
const originalValueShape = {
  originalValueAmount: optionalAmount,
  originalValueCurrency: z.string().trim().toUpperCase().length(3).default('EUR'),
} as const;

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
 * One denomination + quantity — shared by every row of a debt basket and by
 * each free-form repayment. `amount` is money minor units or a quantity
 * (gold / thing), parsed per `denomKind` in the action.
 */
const denomLineShape = {
  amount,
  denomKind: z.enum(['money', 'gold', 'thing']).default('money'),
  currency: z.string().trim().toUpperCase().length(3).default('EUR'),
  /** A `@wib/domain` built-in gold catalogue key. */
  goldType: z.string().trim().min(1).max(40).default('k21'),
  /** The `debt_things` row id when `denomKind === 'thing'`. */
  thingId: z.preprocess(
    blankToNull,
    z.string().uuid().nullable().default(null),
  ),
  /** Denormalised thing name (display + history). */
  thingName: z.preprocess(
    blankToNull,
    z.string().trim().max(60).nullable().default(null),
  ),
  /** `'g'` or `'piece'` — the unit for a gold or thing denomination. */
  goldUnit: z.enum(['g', 'piece']).default('g'),
} as const;

/** One principal row of a debt basket. Also used by the add/edit-row form. */
export const debtLineSchema = z.object({ ...denomLineShape });
export type DebtLineValue = z.input<typeof debtLineSchema>;

/** Create a debt basket: who, which way, when, what for, and one-or-more rows. */
export const debtFormSchema = z.object({
  personId: z.string().uuid('Pick a person'),
  direction: z.enum(['they_owe', 'i_owe']).default('i_owe'),
  incurredOn: z.string().regex(ISO_DATE, 'Pick a date'),
  description: z.preprocess(trimmed, z.string().max(120).default('')),
  notes: z.preprocess(
    blankToNull,
    z.string().trim().max(1000).nullable().default(null),
  ),
  attachments: z.array(attachmentDraftSchema).max(20).default([]),
  lines: z.array(debtLineSchema).min(1, 'Add at least one row').max(20),
  ...originalValueShape,
});
export type DebtFormValues = z.input<typeof debtFormSchema>;

/** Edit an existing debt's metadata only — rows are managed on the detail page. */
export const debtMetaSchema = z.object({
  personId: z.string().uuid('Pick a person'),
  direction: z.enum(['they_owe', 'i_owe']).default('i_owe'),
  incurredOn: z.string().regex(ISO_DATE, 'Pick a date'),
  description: z.preprocess(trimmed, z.string().max(120).default('')),
  notes: z.preprocess(
    blankToNull,
    z.string().trim().max(1000).nullable().default(null),
  ),
  ...originalValueShape,
});
export type DebtMetaValues = z.input<typeof debtMetaSchema>;

/** One repayment against a debt — carries its own denomination. */
export const repaymentFormSchema = z.object({
  ...denomLineShape,
  occurredOn: z.string().regex(ISO_DATE, 'Pick a date'),
  note: z.preprocess(
    blankToNull,
    z.string().trim().max(200).nullable().default(null),
  ),
  attachments: z.array(attachmentDraftSchema).max(20).default([]),
});
export type RepaymentFormValues = z.input<typeof repaymentFormSchema>;

/** A user-defined denomination: name, logo, unit, per-unit reference value. */
export const thingFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  logoUrl: z.preprocess(
    blankToNull,
    z
      .string()
      .max(400_000)
      .startsWith('data:image/', 'That does not look like an image')
      .nullable()
      .default(null),
  ),
  unit: z.enum(['g', 'piece']).default('piece'),
  /** A per-unit reference price — 0 is allowed (no equivalent shown). */
  value: z
    .string()
    .trim()
    .default('0')
    .refine(
      (v) => v === '' || Number.isFinite(Number(v.replace(/[, ]/g, ''))),
      'Not a number',
    ),
  valueCurrency: z.string().trim().toUpperCase().length(3).default('EUR'),
});
export type ThingFormValues = z.input<typeof thingFormSchema>;

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
