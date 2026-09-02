import { z } from 'zod';
import { optionalLogo } from './method-schema';

/** Shared by the on-the-fly "add recipient method" form and its server action. */
export const recipientMethodFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  iconKey: z.string().trim().min(1).max(24).default('transfer'),
  logoUrl: optionalLogo,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
    .default('#6321d6'),
});

export type RecipientMethodFormValues = z.input<
  typeof recipientMethodFormSchema
>;
