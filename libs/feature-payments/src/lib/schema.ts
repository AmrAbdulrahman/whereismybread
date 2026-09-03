import { RECURRENCES } from '@wib/domain';
import { z } from 'zod';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

/** Accept a bare domain — "netflix.com" — and fill in the scheme. */
const normalizeUrl = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t === '') return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
};

const optionalUrl = z.preprocess(
  normalizeUrl,
  z.string().trim().url('Enter a valid URL').max(2048).nullable().default(null),
);

/** One record of a `group` payment — a named value in its own currency. */
export const lineItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name it').max(80),
  /** Major-unit value as typed, e.g. "12.99". */
  value: z
    .string()
    .trim()
    .min(1, 'Enter a value')
    .refine(
      (v) => Number.isFinite(Number(v.replace(/[, ]/g, ''))),
      'Not a number',
    )
    .refine((v) => Number(v.replace(/[, ]/g, '')) > 0, 'Must be more than zero'),
  currency: z.string().trim().length(3).toUpperCase().default('EUR'),
  /** An icon-set key, a fetched logo (data: URI), and a brand colour. The
   * form always supplies an explicit value or `null` (never a blank string). */
  iconKey: z.string().trim().max(40).nullable().default(null),
  logoUrl: z.string().max(300_000).nullable().default(null),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
});

/**
 * A file already uploaded to Vercel Blob, staged on the form until the payment
 * is saved. Only used when creating a payment — edits manage attachments with
 * their own immediate actions.
 */
export const attachmentDraftSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().nonnegative(),
  url: z.string().url().max(2048),
  pathname: z.string().trim().min(1).max(1024),
});

/** Shared by the client form (zodResolver) and the server action. */
export const paymentFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Give it a name').max(120),
    /**
     * `fixed` → `amount` is the charge; `per_unit` → `amount` is the unit price;
     * `group` → the charge is the sum of `lineItems` and `amount` is ignored.
     */
    amountKind: z.enum(['fixed', 'per_unit', 'group']).default('fixed'),
    /** Major-unit amount as typed, e.g. "12.99". Ignored for `group`. */
    amount: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || Number.isFinite(Number(v.replace(/[, ]/g, ''))),
        'Not a number',
      )
      .refine(
        (v) => v === '' || Number(v.replace(/[, ]/g, '')) > 0,
        'Must be more than zero',
      ),
    /** The records a `group` payment's amount is derived from. */
    lineItems: z.array(lineItemSchema).max(50).default([]),
    /** Files staged for a new payment (edits attach immediately instead). */
    attachments: z.array(attachmentDraftSchema).max(20).default([]),
    /** The thing being counted, e.g. "session", "visit" — per-unit only. */
    unitName: z.preprocess(
      blankToNull,
      z.string().trim().min(1).max(40).nullable().default(null),
    ),
    /** Units assumed for each occurrence — per-unit only. */
    defaultUnits: z
      .string()
      .trim()
      .default('1')
      .refine(
        (v) => v === '' || Number.isFinite(Number(v.replace(/[, ]/g, ''))),
        'Not a number',
      )
      .refine(
        (v) => Number(v.replace(/[, ]/g, '') || '1') > 0,
        'Must be more than zero',
      ),
    currency: z.string().trim().length(3).toUpperCase().default('EUR'),
    /** A surcharge added on top: `none`, a `fixed` amount, or a `percent`. */
    feeKind: z.enum(['none', 'fixed', 'percent']).default('none'),
    /** For `fixed` a major-unit amount, for `percent` a number like "2.5". */
    feeValue: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || Number.isFinite(Number(v.replace(/[,% ]/g, ''))),
        'Not a number',
      )
      .refine(
        (v) => v === '' || Number(v.replace(/[,% ]/g, '')) >= 0,
        'Cannot be negative',
      ),
    methodId: z.string().uuid().nullable().default(null),
    accountId: z.string().uuid().nullable().default(null),
    bankId: z.string().uuid().nullable().default(null),
    /** How a manual payment reaches the recipient (Wise, PayPal, cash…). */
    recipientMethodId: z.string().uuid().nullable().default(null),
    recurrence: z.enum(RECURRENCES),
    // One-time payments carry a real date here; recurring payments carry a
    // synthesized start date (from `dayOfMonth` + today) — the form keeps it in
    // sync, the action re-derives it, and it never renders for recurring.
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    /** Day of the month a recurring payment lands on (1–31). */
    dayOfMonth: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^\d{1,2}$/.test(v),
        'Enter a day of the month',
      )
      .refine(
        (v) => v === '' || (Number(v) >= 1 && Number(v) <= 31),
        'Day must be 1–31',
      ),
    // A blank native date input reads back as "" once touched — treat that
    // (and null/undefined) as "not set" rather than a format error.
    endsOn: z.preprocess(
      blankToNull,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
        .nullable()
        .default(null),
    ),
    /** The service / provider website. */
    url: optionalUrl,
    /** Filled in by the branding fetch — not typed by the user. */
    logoUrl: z.preprocess(
      blankToNull,
      z.string().max(300_000).nullable().default(null),
    ),
    brandColor: z.preprocess(
      blankToNull,
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .default(null),
    ),
    notes: z.preprocess(
      blankToNull,
      z.string().trim().max(1000).nullable().default(null),
    ),
    tags: z.array(z.string().trim().min(1)).max(12).default([]),
  })
  .refine(
    (v) => v.recurrence === 'one_time' || !v.endsOn || v.endsOn >= v.anchorDate,
    { path: ['endsOn'], message: 'End date is before the first payment' },
  )
  .refine((v) => v.amountKind === 'group' || v.amount.trim() !== '', {
    path: ['amount'],
    message: 'Enter an amount',
  })
  .refine((v) => v.amountKind !== 'per_unit' || !!v.unitName, {
    path: ['unitName'],
    message: 'Name the unit (e.g. session, visit)',
  })
  .refine((v) => v.amountKind !== 'group' || v.lineItems.length > 0, {
    path: ['lineItems'],
    message: 'Add at least one record',
  })
  .refine((v) => v.recurrence === 'one_time' || /^\d{1,2}$/.test(v.dayOfMonth), {
    path: ['dayOfMonth'],
    message: 'Pick which day of the month',
  })
  .refine(
    (v) =>
      v.feeKind === 'none' || Number(v.feeValue.replace(/[,% ]/g, '')) > 0,
    { path: ['feeValue'], message: 'Enter the fee' },
  );

export type PaymentFormValues = z.input<typeof paymentFormSchema>;
export type PaymentFormOutput = z.output<typeof paymentFormSchema>;
