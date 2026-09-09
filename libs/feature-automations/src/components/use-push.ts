'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deletePushSubscriptionAction,
  savePushSubscriptionAction,
} from '../lib/actions';

/** VAPID public key (base64url) → the byte array `pushManager.subscribe` wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState =
  | 'loading'
  | 'unsupported'
  | 'ios-needs-install'
  | 'denied'
  | 'off'
  | 'on';

export interface PushResult {
  ok: boolean;
  /** Set on failure, and on a permission the user dismissed / denied. */
  error?: string;
}

/**
 * Per-device Web Push: detect the current state and turn it on / off. Callers
 * own their own UI feedback — `enable` / `disable` just report `{ ok, error }`.
 */
export function usePush(vapidPublicKey: string) {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const configured = vapidPublicKey.length > 0;

  const refresh = useCallback(async () => {
    if (!configured) return setState('unsupported');
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    if (!hasSW || !hasPush) {
      // iOS < 16.4, or (16.4+) Safari in a normal tab — push there only works
      // once the app is installed to the Home Screen.
      const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      return setState(iOS ? 'ios-needs-install' : 'unsupported');
    }
    if (Notification.permission === 'denied') return setState('denied');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, [configured]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async (): Promise<PushResult> => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return { ok: false, error: 'Notification permission was not granted.' };
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      const res = await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent.slice(0, 500),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        return { ok: false, error: res.error ?? 'Could not save subscription.' };
      }
      setState('on');
      return { ok: true };
    } catch (err) {
      void refresh();
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Please try again.',
      };
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey, refresh]);

  const disable = useCallback(async (): Promise<PushResult> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState('off');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not turn push off.' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, configured, refresh, enable, disable };
}
