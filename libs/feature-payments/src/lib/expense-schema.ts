import { z } from 'zod';
import { attachmentDraftSchema } from './attachments';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

/** Shared by the expense form (zodResolver) and its server action. */
export const expenseFormSchema = z.object({
  budgetId: z.string().uuid('Pick a budget'),
  name: z.string().trim().min(1, 'Give it a name').max(120),
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
