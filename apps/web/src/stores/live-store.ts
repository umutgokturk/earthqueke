'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Earthquake } from '@ils/types';

export type ConnectionState = 'connecting' | 'open' | 'polling' | 'down';

export interface FeedItem {
  key: string;
  at: string;
  kind: 'new' | 'updated';
  event: Earthquake;
}

interface LiveState {
  connection: ConnectionState;
  /** Last signal from the server (WS message or successful poll), epoch ms. */
  lastMessageAt: number | null;
  /** occurredAt of the most recent earthquake event seen live. */
  lastEventIso: string | null;
  latestEventId: string | null;
  feed: FeedItem[];
  paused: boolean;
  muted: boolean;
  soundOn: boolean;
  /** 0 = off; otherwise minimum magnitude for browser notifications. */
  notifyThreshold: 0 | 3 | 4 | 5;
  setConnection(state: ConnectionState): void;
  markMessage(): void;
  pushFeed(item: FeedItem): void;
  setLastEvent(iso: string, id: string): void;
  setPaused(paused: boolean): void;
  setMuted(muted: boolean): void;
  setSoundOn(on: boolean): void;
  setNotifyThreshold(threshold: 0 | 3 | 4 | 5): void;
}

export const useLiveStore = create<LiveState>()(
  persist(
    (set) => ({
      connection: 'connecting',
      lastMessageAt: null,
      lastEventIso: null,
      latestEventId: null,
      feed: [],
      paused: false,
      muted: false,
      soundOn: false,
      notifyThreshold: 0,
      setConnection: (connection) => set({ connection }),
      markMessage: () => set({ lastMessageAt: Date.now() }),
      pushFeed: (item) =>
        set((s) => ({ feed: [item, ...s.feed].slice(0, 80) })),
      setLastEvent: (iso, id) => set({ lastEventIso: iso, latestEventId: id }),
      setPaused: (paused) => set({ paused }),
      setMuted: (muted) => set({ muted }),
      setSoundOn: (soundOn) => set({ soundOn }),
      setNotifyThreshold: (notifyThreshold) => set({ notifyThreshold }),
    }),
    {
      name: 'ils-live-prefs',
      partialize: (s) => ({
        soundOn: s.soundOn,
        muted: s.muted,
        notifyThreshold: s.notifyThreshold,
      }),
    },
  ),
);
