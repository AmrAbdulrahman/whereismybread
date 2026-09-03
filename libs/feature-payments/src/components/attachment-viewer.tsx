'use client';

import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@wib/ui';
import { attachmentKind } from '../lib/attachments';

export interface ViewableAttachment {
  name: string;
  url: string;
  contentType: string;
}

/** Full-size in-app preview for one attachment: image, PDF, or text. */
export function AttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: ViewableAttachment | null;
  onClose: () => void;
}) {
  const kind = attachment ? attachmentKind(attachment.contentType) : null;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setText(null);
    setError(undefined);
    if (!attachment || kind !== 'text') return;
    let live = true;
    fetch(attachment.url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error())))
      .then((t) => live && setText(t.slice(0, 100_000)))
      .catch(() => live && setError('Could not load this file.'));
    return () => {
      live = false;
    };
  }, [attachment, kind]);

  return (
    <ResponsiveModal
      open={attachment != null}
      onOpenChange={(o) => !o && onClose()}
      title={attachment?.name ?? 'Attachment'}
    >
      {attachment ? (
        <div className="flex flex-col gap-3">
          {kind === 'image' ? (
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-h-[70vh] w-full rounded-lg border border-line object-contain"
            />
          ) : kind === 'pdf' ? (
            <iframe
              src={attachment.url}
              title={attachment.name}
              className="h-[70vh] w-full rounded-lg border border-line"
            />
          ) : kind === 'text' ? (
            error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : text == null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink">
                {text}
              </pre>
            )
          ) : (
            <p className="text-sm text-muted">
              This file type can&rsquo;t be previewed here.
            </p>
          )}
          <a
            href={attachment.url}
            target="_blank"
            rel="noreferrer noopener"
            className="self-start text-sm font-medium text-accent hover:underline"
          >
            Open in a new tab
          </a>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}
