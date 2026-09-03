'use client';

import { useState } from 'react';
import { ResponsiveModal, cn } from '@wib/ui';
import { FileText, Paperclip } from '@wib/ui/icons';
import { attachmentKind, attachmentSrc, formatBytes } from '../lib/attachments';
import type { OccurrenceAttachment } from '../lib/types';
import { AttachmentViewer, type ViewableAttachment } from './attachment-viewer';

/** A paperclip chip on an occurrence → a list of the payment's files to preview. */
export function OccurrenceAttachments({
  attachments,
  label,
}: {
  attachments: OccurrenceAttachment[];
  /** Payment name, for the modal title. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<ViewableAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${attachments.length} attachment${
          attachments.length === 1 ? '' : 's'
        }`}
        className="flex shrink-0 items-center gap-0.5 rounded-full border border-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Paperclip size={11} strokeWidth={2.5} />
        {attachments.length}
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={`Attachments · ${label}`}
      >
        <ul className="flex flex-col gap-1.5">
          {attachments.map((a) => {
            const kind = attachmentKind(a.contentType);
            const src = attachmentSrc(a.pathname);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() =>
                    setViewing({
                      name: a.name,
                      url: src,
                      contentType: a.contentType,
                    })
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left',
                    'hover:border-line-strong',
                  )}
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
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {a.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {formatBytes(a.size)} · Preview
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ResponsiveModal>

      <AttachmentViewer
        attachment={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
