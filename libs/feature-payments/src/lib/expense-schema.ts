import { z } from 'zod';
import { attachmentDraftSchema } from './attachments';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

/** Shared by the expense form (zodResolver) and its server action. */
export const expenseFormSchema = z.object({
  /** `null` (or blank) — this expense isn't tracked against any budget. */
  budgetId: z.preprocess(
    blankToNull,
    z.string().uuid().nullable().default(null),
  ),
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
  attachments: z.array(attachmentDraftSchema).max(20).default([]),
});

export type ExpenseFormValues = z.input<typeof expenseFormSchema>;
