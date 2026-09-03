'use client';

import { LabelManager, MethodIcon, type LabelItem } from '@wib/ui';
import {
  deleteBankAction,
  listBanksAction,
  saveBankAction,
  type BankMark,
} from '../lib/actions';
import { MethodMarkPicker } from './method-mark-picker';

/** The list-row mark: fetched/uploaded logo, then icon, then the colour dot. */
function BankMarkView({
  mark,
  color,
}: {
  mark: BankMark | undefined;
  color: string;
}) {
  if (mark?.logoUrl) {
    return (
      <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-md border border-line bg-surface">
        <img src={mark.logoUrl} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }
  if (mark?.iconKey) {
    return (
      <span
        className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface"
        style={{ color }}
      >
        <MethodIcon iconKey={mark.iconKey} size={15} />
      </span>
    );
  }
  return (
    <span
      className="h-3 w-3 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

/**
 * The /banks management page. Wraps the generic `<LabelManager>` with a bank's
 * icon / logo mark (icon grid + upload + fetch-from-URL, via `MethodMarkPicker`).
 */
export function BankManager({ items }: { items: LabelItem<BankMark>[] }) {
  return (
    <LabelManager<BankMark>
      title="Banks"
      noun="bank"
      usageNoun="payment"
      deleteImpact="unlink"
      description="The bank behind a direct-debit or card payment — give it an icon or logo."
      namePlaceholder="Monzo, Barclays, Revolut…"
      items={items}
      onSave={saveBankAction}
      onDelete={deleteBankAction}
      onRefresh={listBanksAction}
      newMark={{ iconKey: 'bank', logoUrl: null }}
      renderMark={(item) => (
        <BankMarkView mark={item.mark} color={item.color} />
      )}
      renderMarkEditor={(mark, setMark, setColor) => (
        <MethodMarkPicker
          iconKey={mark.iconKey ?? 'bank'}
          logoUrl={mark.logoUrl}
          onIconChange={(key) =>
            setMark((m) => ({ ...m, iconKey: key, logoUrl: null }))
          }
          onLogoChange={(uri) =>
            setMark((m) => ({
              ...m,
              iconKey: uri ? null : m.iconKey,
              logoUrl: uri,
            }))
          }
          onColorChange={setColor}
        />
      )}
    />
  );
}
