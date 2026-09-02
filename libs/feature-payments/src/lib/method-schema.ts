import { PAYMENT_METHOD_KINDS } from '@wib/domain';
import { z } from 'zod';

const blankToNull = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? null : v;

/** An uploaded image, as a `data:` URI (see fileToLogoDataUrl). */
export const optionalLogo = z.preprocess(
  blankToNull,
  z.string().max(300_000).nullable().default(null),
);

/** Shared by the on-the-fly "add method" form and its server action. */
export const methodFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  kind: z.enum(PAYMENT_METHOD_KINDS).default('manual_transfer'),
  iconKey: z.string().trim().min(1).max(24).default('wallet'),
  logoUrl: optionalLogo,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
    .default('#6321d6'),
});

export type MethodFormValues = z.input<typeof methodFormSchema>;
