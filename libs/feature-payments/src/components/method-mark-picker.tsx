'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Label,
  MethodIcon,
  METHOD_ICON_KEYS,
  Spinner,
  cn,
} from '@wib/ui';
import { ImagePlus } from '@wib/ui/icons';
import { fetchBrandingAction } from '../lib/actions';
import { fileToLogoDataUrl } from '../lib/logo-file';

const looksLikeSite = (v: string) =>
  /^https?:\/\/.+\..+/i.test(v) || /^[\w-]+\.[a-z]{2,}/i.test(v);

/** Icon grid + upload / fetch-from-URL — a method / recipient-method's mark. */
export function MethodMarkPicker({
  iconKey,
  logoUrl,
  onIconChange,
  onLogoChange,
  onColorChange,
  onNameSuggest,
}: {
  iconKey: string;
  logoUrl: string | null;
  onIconChange: (key: string) => void;
  onLogoChange: (uri: string | null) => void;
  /** Called with a brand colour pulled from a website. */
  onColorChange?: (hex: string) => void;
  /** Called with a name pulled from a website — the caller decides to use it. */
  onNameSuggest?: (name: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  // Keep the latest callbacks without re-running the fetch effect.
  const cbs = useRef({ onLogoChange, onColorChange, onNameSuggest });
  cbs.current = { onLogoChange, onColorChange, onNameSuggest };

  const [siteUrl, setSiteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const lastFetched = useRef('');

  useEffect(() => {
    const v = siteUrl.trim();
    if (!looksLikeSite(v) || v === lastFetched.current) return;
    const handle = setTimeout(async () => {
      lastFetched.current = v;
      setNote(undefined);
      setBusy(true);
      try {
        const result = await fetchBrandingAction(v);
        if (!result.ok) {
          setNote(result.error);
          return;
        }
        const { branding } = result;
        if (branding.logoUrl) cbs.current.onLogoChange(branding.logoUrl);
        if (branding.color) cbs.current.onColorChange?.(branding.color);
        if (branding.name) cbs.current.onNameSuggest?.(branding.name);
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
  }, [siteUrl]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(undefined);
    try {
      onLogoChange(await fileToLogoDataUrl(file));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not use that image.',
      );
    }
  };

  return (
    <Field>
      <Label>Icon</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={logoUrl ? 'Replace image' : 'Upload an image'}
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
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            type="url"
            inputMode="url"
            aria-label="Fetch logo from a website"
            placeholder="paste a site — stripe.com"
            className="flex-1"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
          />
          {busy ? <Spinner /> : null}
        </div>
      </div>

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : note ? (
        <p className="text-xs text-muted">{note}</p>
      ) : (
        <p className="text-xs text-muted">
          Upload an image, paste a site to pull its logo, or pick an icon.
        </p>
      )}

      {logoUrl ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => onLogoChange(null)}
        >
          Use an icon instead
        </Button>
      ) : null}

      <div className="mt-1 flex flex-wrap gap-1.5">
        {METHOD_ICON_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={key}
            aria-pressed={!logoUrl && iconKey === key}
            onClick={() => {
              onIconChange(key);
              onLogoChange(null);
            }}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-md border',
              !logoUrl && iconKey === key
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-line-strong text-muted hover:text-ink',
            )}
          >
            <MethodIcon iconKey={key} size={16} />
          </button>
        ))}
      </div>
    </Field>
  );
}
