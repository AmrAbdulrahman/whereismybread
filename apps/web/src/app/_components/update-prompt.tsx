'use client';

import { useEffect } from 'react';
import { useUpdateCheck } from '@wib/updates';
import { Button, useToast } from '@wib/ui';

/**
 * Passive half of the update flow: when a background check finds a newer
 * deployment, nudge the user with a toast that reloads onto it. The explicit
 * "Check for updates" action lives in Settings (Phase 6).
 */
export function UpdatePrompt() {
  const { updateAvailable, applyUpdate } = useUpdateCheck();
  const { toast } = useToast();

  useEffect(() => {
    if (!updateAvailable) return;
    toast({
      title: 'Update available',
      description: 'A newer version of the app is ready.',
      duration: 0,
      action: { label: 'Reload', onClick: applyUpdate },
    });
  }, [updateAvailable, applyUpdate, toast]);

  return null;
}

export function CheckForUpdatesButton() {
  const { checking, checkNow, updateAvailable, applyUpdate, lastChecked } =
    useUpdateCheck();

  if (updateAvailable) {
    return (
      <Button size="sm" onClick={applyUpdate}>
        Reload to update
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void checkNow()}
        disabled={checking}
      >
        {checking ? 'Checking…' : 'Check for updates'}
      </Button>
      {lastChecked ? (
        <span className="text-xs text-muted">
          You&rsquo;re on the latest version
        </span>
      ) : null}
    </div>
  );
}
