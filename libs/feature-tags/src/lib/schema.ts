import { z } from 'zod';

/** Shared by the tag form (zodResolver) and its server actions. */
export const tagFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(40),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
    .default('#6321d6'),
});

export type TagFormValues = z.input<typeof tagFormSchema>;
