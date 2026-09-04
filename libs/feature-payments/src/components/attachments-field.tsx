'use client';

import { useRef, useState } from 'react';
import type { FormState } from '@wib/auth';
import { Button, Spinner } from '@wib/ui';
import { FileText, Plus, X } from '@wib/ui/icons';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  attachmentKind,
  attachmentSrc,
  formatBytes,
  resolveAttachmentType,
} from '../lib/attachments';
import type { AttachmentDraft, OccurrenceAttachment } from '../lib/types';
import { AttachmentViewer } from './attachment-viewer';

export interface AttachmentUploadResult {
  ok: boolean;
  draft?: AttachmentDraft;
  attachment?: OccurrenceAttachment | null;
  error?: string;
}

/**
 * Manage a payment's or expense's attachments. In **edit** mode (`ownerId`
 * set) each add / remove hits the server immediately; when **creating**
 * (`ownerId` null) the files are uploaded to Blob and staged in the form,
 * then attached once the owner row exists.
 */
export function AttachmentsField({
  ownerId,
  saved,
  onSavedChange,
  drafts,
  onDraftsChange,
  upload,
  remove: removeAction,
  discard,
}: {
  ownerId: string | null;
  saved: OccurrenceAttachment[];
  onSavedChange: (next: OccurrenceAttachment[]) => void;
  drafts: AttachmentDraft[];
  onDraftsChange: (next: AttachmentDraft[]) => void;
  upload: (
    ownerId: string | null,
    form: FormData,
  ) => Promise<AttachmentUploadResult>;
  remove: (id: string) => Promise<FormState>;
  discard: (urls: string[]) => Promise<{ ok: true }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [viewing, setViewing] = useState<{
    name: string;
    url: string;
    contentType: string;
  } | null>(null);

  const items: Array<OccurrenceAttachment | AttachmentDraft> = ownerId
    ? saved
    : drafts;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(undefined);

    if (!resolveAttachmentType(file.name, file.type)) {
      setError('Only images, PDFs and text files can be attached.');
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError(`That file is over ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await upload(ownerId, body);
      if (!res.ok) {
        setError(res.error ?? 'Could not upload that file.');
        return;
      }
      if (ownerId && res.attachment) {
        onSavedChange([...saved, res.attachment]);
      } else if (res.draft) {
        onDraftsChange([...drafts, res.draft]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not upload that file.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: OccurrenceAttachment | AttachmentDraft) => {
    if ('id' in a) {
      onSavedChange(saved.filter((s) => s.id !== a.id));
      await removeAction(a.id);
    } else {
      onDraftsChange(drafts.filter((d) => d.pathname !== a.pathname));
      await discard([a.url]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((a) => {
            const kind = attachmentKind(a.contentType);
            const key = 'id' in a ? a.id : a.pathname;
            const src = attachmentSrc(a.pathname);
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface-2 text-muted">
                  {kind === 'image' ? (
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText size={14} strokeWidth={2} />
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Preview ${a.name}`}
                  onClick={() =>
                    setViewing({
                      name: a.name,
                      url: src,
                      contentType: a.contentType,
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm text-ink">
                    {a.name}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {formatBytes(a.size)} · Preview
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  aria-label={`Remove ${a.name}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <input
        ref={fileRef}
        id="attachment-file"
        type="file"
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={onPick}
      />
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? <Spinner /> : <Plus size={15} strokeWidth={2.5} />}
        Add a file
      </Button>

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        <p className="text-xs text-muted">
          Images, PDFs or text files, up to {formatBytes(ATTACHMENT_MAX_BYTES)}.
        </p>
      )}

      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
