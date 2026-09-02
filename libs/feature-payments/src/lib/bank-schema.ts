import { z } from 'zod';

/** Shared by the on-the-fly "add bank" form and its server action. */
export const bankFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
    .default('#6321d6'),
});

export type BankFormValues = z.input<typeof bankFormSchema>;
