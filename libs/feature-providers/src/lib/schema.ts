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

export const optionalProviderUrl = z.preprocess(
  normalizeUrl,
  z.string().trim().url('Enter a valid URL').max(2048).nullable().default(null),
);

/** Shared by the provider form (zodResolver) and its server action. */
export const providerFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(120),
  url: optionalProviderUrl,
  logoUrl: z.preprocess(blankToNull, z.string().nullable().default(null)),
  color: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour')
      .nullable()
      .default(null),
  ),
  /** Default tag names that auto-populate when this provider is picked. */
  defaultTags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export type ProviderFormValues = z.input<typeof providerFormSchema>;
