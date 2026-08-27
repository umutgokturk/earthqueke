'use client';

import { create } from 'zustand';

export interface MapLayerState {
  earthquakes: boolean;
  faults: boolean;
  istanbulBoundary: boolean;
  districts: boolean;
  heatmap: boolean;
  /** Which time window the earthquake layer shows. */
  window: '24h' | '7d';
}

interface MapState extends MapLayerState {
  toggle(layer: keyof MapLayerState): void;
  setWindow(window: '24h' | '7d'): void;
}

export const useMapStore = create<MapState>((set) => ({
  earthquakes: true,
  faults: true,
  istanbulBoundary: true,
  districts: true,
  heatmap: false,
  window: '24h',
  toggle: (layer) =>
    set((s) => (layer === 'window' ? s : { ...s, [layer]: !s[layer] })),
  setWindow: (window) => set({ window }),
}));
