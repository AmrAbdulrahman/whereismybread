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

/** Shared by the client form (zodResolver) and the server action. */
export const paymentFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Give it a name').max(120),
    /** `fixed` → `amount` is the charge; `per_unit` → `amount` is the unit price. */
    amountKind: z.enum(['fixed', 'per_unit']).default('fixed'),
    /** Major-unit amount as typed, e.g. "12.99". */
    amount: z
      .string()
      .trim()
      .min(1, 'Enter an amount')
      .refine(
        (v) => Number.isFinite(Number(v.replace(/[, ]/g, ''))),
        'Not a number',
      )
      .refine(
        (v) => Number(v.replace(/[, ]/g, '')) > 0,
        'Must be more than zero',
      ),
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
  .refine((v) => v.amountKind === 'fixed' || !!v.unitName, {
    path: ['unitName'],
    message: 'Name the unit (e.g. session, visit)',
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
