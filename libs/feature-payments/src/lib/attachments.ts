/**
 * The pure attachment rules now live in `@wib/ui` (shared with feature-debts).
 * This module re-exports them and keeps the zod draft schema local — `@wib/ui`
 * has no zod dependency.
 */
import { z } from 'zod';

export {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ALLOWED_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  attachmentKind,
  attachmentSrc,
  formatBytes,
  isBlobUrl,
  resolveAttachmentType,
  type AttachmentContentType,
  type AttachmentKind,
} from '@wib/ui';

/**
 * A file already uploaded to Vercel Blob, staged on a form until its owner
 * (payment / expense) is saved. Edits manage attachments with their own
 * immediate actions instead of this staging.
 */
export const attachmentDraftSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().nonnegative(),
  url: z.string().url().max(2048),
  pathname: z.string().trim().min(1).max(1024),
});
