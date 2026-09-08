'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Input, Label, Spinner } from '@wib/ui';
import { ImagePlus } from '@wib/ui/icons';
import { fetchBrandingAction } from '../lib/actions';
import { fileToLogoDataUrl } from '../lib/logo-file';

/** Looks like a URL or a bare domain we should try to fetch branding for. */
function looksFetchable(value: string): boolean {
  return (
    /^https?:\/\/.+\..+/i.test(value) || /^[\w-]+\.[a-z]{2,}/i.test(value)
  );
}

/**
 * A "Provider" website field, shared by the payment and expense forms. Typing a
 * domain debounce-fetches the site's logo + brand colour (and fills the name if
 * blank); the icon button uploads a logo by hand instead. Fully controlled —
 * the parent owns `url` / `logoUrl` / `brandColor` / `name` in its form state.
 */
export function ProviderField({
  url,
  onUrlChange,
  logoUrl,
  onLogoUrlChange,
  onBrandColorChange,
  name,
  onNameChange,
  error,
  label = 'Provider',
  id = 'provider-url',
}: {
  url: string;
  onUrlChange: (v: string) => void;
  logoUrl: string | null;
  onLogoUrlChange: (v: string | null) => void;
  onBrandColorChange?: (v: string | null) => void;
  name: string;
  onNameChange: (v: string) => void;
  error?: string;
  label?: string;
  id?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [logoError, setLogoError] = useState<string>();
  const lastFetched = useRef(url.trim());
  const manualLogo = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Keep the latest callbacks/name without retriggering the debounce.
  const latest = useRef({ onLogoUrlChange, onBrandColorChange, onNameChange, name });
  latest.current = { onLogoUrlChange, onBrandColorChange, onNameChange, name };

  useEffect(() => {
    const value = url.trim();
    if (!looksFetchable(value) || value === lastFetched.current) return;
    const handle = setTimeout(async () => {
      lastFetched.current = value;
      manualLogo.current = false;
      setNote(undefined);
      setBusy(true);
      try {
        const result = await fetchBrandingAction(value);
        if (!result.ok) {
          setNote(result.error);
          return;
        }
        const { branding } = result;
        if (branding.logoUrl && !manualLogo.current)
          latest.current.onLogoUrlChange(branding.logoUrl);
        if (branding.color)
          latest.current.onBrandColorChange?.(branding.color);
        if (branding.name && !latest.current.name.trim())
          latest.current.onNameChange(branding.name);
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
    <Field>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          aria-label={logoUrl ? 'Replace logo' : 'Upload a logo'}
          title={logoUrl ? 'Replace logo' : 'Upload a logo'}
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
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
          id={`${id}-logo`}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onLogoFile}
        />
        <Input
          id={id}
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
      ) : error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : note ? (
        <p className="text-xs text-muted">{note}</p>
      ) : (
        <p className="text-xs text-muted">
          Paste the provider’s site, or tap the icon to upload a logo.
        </p>
      )}
    </Field>
  );
}
