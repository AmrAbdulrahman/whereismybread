import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shared by the budget form (zodResolver) and its server action. */
export const budgetFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Give it a name').max(80),
    /** `month` → the whole calendar month. `week` → one Monday–Sunday week in it. */
    period: z.enum(['month', 'week']).default('month'),
    startDate: z.string().regex(ISO_DATE, 'Pick a month or week'),
    endDate: z.string().regex(ISO_DATE, 'Pick a month or week'),
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
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
      .default('#6321d6'),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'That period ends before it starts',
  });

export type BudgetFormValues = z.input<typeof budgetFormSchema>;
