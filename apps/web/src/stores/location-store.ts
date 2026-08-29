'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserCoords {
  latitude: number;
  longitude: number;
  /** epoch ms — ne zaman alındı */
  at: number;
}

interface LocationState {
  coords: UserCoords | null;
  /** izin istenirken true */
  pending: boolean;
  error: string | null;
  request(): void;
  clear(): void;
}

/**
 * Kullanıcı konumu — YALNIZCA tarayıcıda tutulur, sunucuya asla gönderilmez.
 * Mesafeler istemci tarafında hesaplanır.
 */
export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      coords: null,
      pending: false,
      error: null,
      request: () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          set({ error: 'Tarayıcı konum desteklemiyor' });
          return;
        }
        set({ pending: true, error: null });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            set({
              coords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                at: Date.now(),
              },
              pending: false,
              error: null,
            });
          },
          () => {
            set({ pending: false, error: 'Konum izni alınamadı' });
          },
          { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
        );
      },
      clear: () => set({ coords: null, error: null }),
    }),
    { name: 'ils-location', partialize: (s) => ({ coords: s.coords }) as Partial<LocationState> },
  ),
);

/** Küresel yüzeyde iki nokta arası km (haversine). */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
