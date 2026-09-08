import { z } from 'zod';
import { attachmentDraftSchema } from './attachments';

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

/** Shared by the expense form (zodResolver) and its server action. */
export const expenseFormSchema = z.object({
  /** `null` (or blank) — this expense isn't tracked against any budget. */
  budgetId: z.preprocess(
    blankToNull,
    z.string().uuid().nullable().default(null),
  ),
  /** `null` (or blank) — not assigned to any account. */
  accountId: z.preprocess(
    blankToNull,
    z.string().uuid().nullable().default(null),
  ),
  /** `null` (or blank) — not assigned to any bank. */
  bankId: z.preprocess(
    blankToNull,
    z.string().uuid().nullable().default(null),
  ),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  name: z.string().trim().min(1, 'Give it a name').max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
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
  currency: z.string().trim().length(3).toUpperCase().default('EUR'),
  notes: z.preprocess(
    blankToNull,
    z.string().trim().max(1000).nullable().default(null),
  ),
  /** Service / provider website — pulls a logo + brand colour. */
  url: optionalUrl,
  logoUrl: z.preprocess(
    blankToNull,
    z.string().nullable().default(null),
  ),
  brandColor: z.preprocess(
    blankToNull,
    z.string().nullable().default(null),
  ),
  attachments: z.array(attachmentDraftSchema).max(20).default([]),
});

export type ExpenseFormValues = z.input<typeof expenseFormSchema>;
