import { z } from 'zod';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

/** Shared by the on-the-fly "add bank" form and its server actions. */
export const bankFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
    .default('#6321d6'),
  /** An icon-set key, or a fetched / uploaded logo (data: URI). */
  iconKey: z.preprocess(
    blankToNull,
    z.string().trim().max(40).nullable().default(null),
  ),
  logoUrl: z.preprocess(
    blankToNull,
    z.string().max(300_000).nullable().default(null),
  ),
});

export type BankFormValues = z.input<typeof bankFormSchema>;
