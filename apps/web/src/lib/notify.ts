'use client';

import type { Earthquake } from '@ils/types';

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Neutral, factual notification wording only — never alarmist and never
 * predictive ("tehlike", "büyük deprem geliyor" are forbidden by design).
 */
export function notifyEarthquake(event: Earthquake): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(`İstanbul çevresinde M${event.magnitude.toFixed(1)} büyüklüğünde deprem kaydedildi.`, {
      body: `${event.location} · Derinlik ${event.depthKm.toFixed(1)} km · Kaynak: ${event.source}`,
      tag: `ils-${event.id}`,
      silent: true,
    });
  } catch {
    /* notifications are best-effort */
  }
}
