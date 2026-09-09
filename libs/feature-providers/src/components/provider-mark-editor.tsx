'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Field,
  Input,
  Label,
  Spinner,
  TagInput,
  fileToLogoDataUrl,
  type TagOption,
} from '@wib/ui';
import { ImagePlus } from '@wib/ui/icons';
import { fetchProviderBrandingAction } from '../lib/actions';

/** Looks like a URL or a bare domain worth fetching branding for. */
function looksFetchable(value: string): boolean {
  return /^https?:\/\/.+\..+/i.test(value) || /^[\w-]+\.[a-z]{2,}/i.test(value);
}

/**
 * The shared editor for a provider's icon + website + default tags. Used both
 * inside the `<LabelManager>` mark editor on /providers and by `<ProviderForm>`
 * (the on-the-fly create sheet in the payment / expense / automation pickers).
 * Fully controlled — the parent owns every value.
 */
export function ProviderMarkEditor({
  url,
  logoUrl,
  color,
  defaultTags,
  onUrlChange,
  onLogoUrlChange,
  onColorChange,
  onDefaultTagsChange,
  onNameSuggest,
  tagOptions,
}: {
  url: string;
  logoUrl: string | null;
  color: string | null;
  defaultTags: string[];
  onUrlChange: (v: string) => void;
  onLogoUrlChange: (v: string | null) => void;
  onColorChange?: (v: string) => void;
  onDefaultTagsChange: (v: string[]) => void;
  onNameSuggest?: (v: string) => void;
  tagOptions: TagOption[];
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [logoError, setLogoError] = useState<string>();
  const lastFetched = useRef(url.trim());
  const manualLogo = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const latest = useRef({ onLogoUrlChange, onColorChange, onNameSuggest });
  latest.current = { onLogoUrlChange, onColorChange, onNameSuggest };

  useEffect(() => {
    const value = url.trim();
    if (!looksFetchable(value) || value === lastFetched.current) return;
    const handle = setTimeout(async () => {
      lastFetched.current = value;
      manualLogo.current = false;
      setNote(undefined);
      setBusy(true);
      try {
        const result = await fetchProviderBrandingAction(value);
        if (!result.ok) {
          setNote(result.error);
          return;
        }
        const { branding } = result;
        if (branding.logoUrl && !manualLogo.current)
          latest.current.onLogoUrlChange(branding.logoUrl);
        if (branding.color) latest.current.onColorChange?.(branding.color);
        if (branding.name) latest.current.onNameSuggest?.(branding.name);
        setNote(
          branding.logoUrl
            ? 'Pulled in the logo and colour.'
            : 'Found a colour.',
        );
      } finally {
        setBusy(false);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [url]);

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(undefined);
    try {
      const uri = await fileToLogoDataUrl(file);
      manualLogo.current = true;
      onLogoUrlChange(uri);
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : 'Could not use that image.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <Label htmlFor="provider-url">Website</Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            aria-label={logoUrl ? 'Replace icon' : 'Upload an icon'}
            title={logoUrl ? 'Replace icon' : 'Upload an icon'}
            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
            style={
              !logoUrl && color ? { borderColor: color, color } : undefined
            }
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <ImagePlus size={15} strokeWidth={2} />
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onLogoFile}
          />
          <Input
            id="provider-url"
            type="url"
            inputMode="url"
            placeholder="netflix.com"
            className="flex-1"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
          {busy ? <Spinner /> : null}
        </div>
        {logoError ? (
          <p className="text-xs text-danger">{logoError}</p>
        ) : note ? (
          <p className="text-xs text-muted">{note}</p>
        ) : (
          <p className="text-xs text-muted">
            Paste the provider’s site to pull its icon, or tap the square to
            upload one.
          </p>
        )}
      </Field>

      <Field>
        <Label>Default tags</Label>
        <TagInput
          value={defaultTags}
          onChange={onDefaultTagsChange}
          options={tagOptions}
        />
        <p className="text-xs text-muted">
          Added automatically when you pick this provider on a payment or
          expense.
        </p>
      </Field>
    </div>
  );
}
