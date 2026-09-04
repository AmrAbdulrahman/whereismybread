/**
 * Shared attachment rules — imported by the client picker, the upload route
 * handler, and the server actions. No secrets, no I/O.
 */
import { z } from 'zod';

/** 10 MB — comfortably covers a scanned multi-page PDF or a phone photo. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Content types we accept, mapped to how the in-app viewer renders them. */
export const ATTACHMENT_TYPES = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/avif': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'text',
} as const satisfies Record<string, 'image' | 'pdf' | 'text'>;

export type AttachmentContentType = keyof typeof ATTACHMENT_TYPES;
export type AttachmentKind = (typeof ATTACHMENT_TYPES)[AttachmentContentType];

export const ATTACHMENT_ALLOWED_TYPES = Object.keys(
  ATTACHMENT_TYPES,
) as AttachmentContentType[];

/** `accept` attribute for the file input. */
export const ATTACHMENT_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/avif,application/pdf,text/plain,text/markdown,text/csv,.txt,.md,.markdown,.csv,.log';

const TEXT_EXTENSIONS = /\.(txt|text|md|markdown|csv|log|tsv)$/i;

/**
 * Best-effort content type for a picked file. Browsers often report an empty
 * or bogus type for `.md` / `.csv` / `.log`, so fall back to the extension.
 */
export function resolveAttachmentType(
  name: string,
  reported: string,
): AttachmentContentType | null {
  const t = reported.toLowerCase().split(';')[0]?.trim() ?? '';
  if (t in ATTACHMENT_TYPES) return t as AttachmentContentType;
  if ((t === '' || t.startsWith('text/')) && TEXT_EXTENSIONS.test(name)) {
    return 'text/plain';
  }
  return null;
}

export function attachmentKind(contentType: string): AttachmentKind | null {
  return contentType in ATTACHMENT_TYPES
    ? ATTACHMENT_TYPES[contentType as AttachmentContentType]
    : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * In-app URL for viewing an attachment. The blob store is private, so files are
 * streamed back through an authenticated route keyed by the blob pathname
 * (which is scoped to the owning user — see the route handler).
 */
export function attachmentSrc(pathname: string): string {
  return `/api/attachments?path=${encodeURIComponent(pathname)}`;
}

/** A blob URL is only ours if it lives on the Vercel Blob storage host. */
export function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname.endsWith('.blob.vercel-storage.com')
    );
  } catch {
    return false;
  }
}

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
