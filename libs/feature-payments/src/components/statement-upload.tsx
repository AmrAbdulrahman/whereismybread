'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, useToast } from '@wib/ui';
import { Upload } from '@wib/ui/icons';
import { importStatementAction } from '../lib/statement-import-actions';

export function StatementUpload({
  defaultCurrency,
}: {
  defaultCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('defaultCurrency', defaultCurrency);
      const result = await importStatementAction(form);
      if (!result.ok) {
        toast({ title: 'Import failed', description: result.error, duration: 6000 });
        return;
      }
      const skipped = result.skipped ?? 0;
      toast({
        title:
          result.imported === 0
            ? 'Nothing new to import'
            : `Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'}`,
        description:
          result.imported === 0
            ? `All ${result.parsed} rows in that ${result.source} statement were already imported.`
            : skipped > 0
              ? `${skipped} already seen and skipped. Detected format: ${result.source}.`
              : `Detected format: ${result.source}.`,
        duration: 5000,
      });
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) void upload(file);
      }}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
        dragOver ? 'border-accent bg-accent/5' : 'border-line-strong'
      }`}
    >
      <Upload size={20} className="text-muted" />
      <p className="text-sm text-ink-soft">
        Drop a bank statement <span className="text-muted">(.csv)</span> here, or
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Choose a file'}
      </Button>
      <p className="text-[11px] text-muted">
        Works with Wise, Monzo, Revolut, Starling and most CSV exports. Only new
        transactions are pulled in.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
