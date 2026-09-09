'use client';

import { LabelManager, type LabelItem, type TagOption } from '@wib/ui';
import { Store } from '@wib/ui/icons';
import {
  deleteProviderAction,
  listProvidersAction,
  saveProviderAction,
  type ProviderMark,
} from '../lib/actions';
import { ProviderMarkEditor } from './provider-mark-editor';

function ProviderMarkView({
  mark,
  color,
}: {
  mark: ProviderMark | undefined;
  color: string;
}) {
  if (mark?.logoUrl) {
    return (
      <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-md border border-line bg-surface">
        <img src={mark.logoUrl} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface"
      style={{ color }}
    >
      <Store size={15} />
    </span>
  );
}

/**
 * The /providers management page. Wraps the generic `<LabelManager>` with a
 * provider's icon / website / default-tag editor.
 */
export function ProviderManager({
  items,
  tags,
}: {
  items: LabelItem<ProviderMark>[];
  tags: TagOption[];
}) {
  return (
    <LabelManager<ProviderMark>
      title="Providers"
      noun="provider"
      usageNoun="record"
      deleteImpact="unlink"
      description="Services you pay — Netflix, the landlord, the gym. Reused across payments, expenses and automations, with a default set of tags."
      namePlaceholder="Netflix, Vodafone, the landlord…"
      items={items}
      onSave={saveProviderAction}
      onDelete={deleteProviderAction}
      onRefresh={listProvidersAction}
      newMark={{ url: null, logoUrl: null, defaultTags: [] }}
      renderMark={(item) => (
        <ProviderMarkView mark={item.mark} color={item.color} />
      )}
      renderMarkEditor={(mark, setMark, setColor) => (
        <ProviderMarkEditor
          url={mark.url ?? ''}
          logoUrl={mark.logoUrl}
          color={null}
          defaultTags={mark.defaultTags}
          onUrlChange={(v) => setMark((m) => ({ ...m, url: v || null }))}
          onLogoUrlChange={(v) => setMark((m) => ({ ...m, logoUrl: v }))}
          onColorChange={setColor}
          onDefaultTagsChange={(v) =>
            setMark((m) => ({ ...m, defaultTags: v }))
          }
          tagOptions={tags}
        />
      )}
    />
  );
}
