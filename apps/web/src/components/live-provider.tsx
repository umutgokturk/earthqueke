'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { Earthquake, WsServerEvent } from '@ils/types';
import { api, qs, wsUrl } from '@/lib/api';
import { playBlip } from '@/lib/sound';
import { notifyEarthquake } from '@/lib/notify';
import { useLiveStore } from '@/stores/live-store';
import { useToastStore } from '@/stores/toast-store';

const POLL_INTERVAL_MS = 30_000;
const RECONNECT_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const HEARTBEAT_TIMEOUT_MS = 45_000;

/**
 * Single live-data connection for the whole app.
 * WebSocket first; if the socket cannot be (re)established, falls back to
 * 30-second polling of /api/earthquakes/latest?since=… and keeps retrying the
 * socket — polling stops the moment the socket is back (spec §23).
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const seenRef = useRef<Map<string, string>>(new Map()); // id -> updatedAt
  const wsRef = useRef<WebSocket | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempt = useRef(0);
  const watchdog = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedByUs = useRef(false);

  useEffect(() => {
    const store = useLiveStore.getState;

    const rememberSeen = (event: Earthquake) => {
      const seen = seenRef.current;
      seen.set(event.id, event.updatedAt);
      if (seen.size > 600) {
        for (const key of [...seen.keys()].slice(0, 200)) seen.delete(key);
      }
    };

    const applyToCaches = (event: Earthquake, kind: 'new' | 'updated') => {
      queryClient.setQueriesData<Earthquake[]>({ queryKey: ['latest'] }, (old) => {
        if (!old) return old;
        const without = old.filter((e) => e.id !== event.id);
        const next = kind === 'new' || !old.some((e) => e.id === event.id)
          ? [event, ...without]
          : [event, ...without].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
        return next.slice(0, Math.max(old.length, 30));
      });
      queryClient.setQueryData<Earthquake>(['earthquake', event.id], event);
      void queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: ['timeline'], refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: ['earthquakes'], refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: ['distribution'], refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: ['faultStats'], refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: ['districtStats'], refetchType: 'active' });
    };

    const handleEvent = (event: Earthquake, kind: 'new' | 'updated') => {
      const s = store();
      const previously = seenRef.current.get(event.id);
      if (previously === event.updatedAt) return; // duplicate delivery
      rememberSeen(event);
      applyToCaches(event, kind);
      s.setLastEvent(event.occurredAt, event.id);
      s.markMessage();
      if (s.paused) return;
      s.pushFeed({ key: `${event.id}-${event.updatedAt}`, at: new Date().toISOString(), kind, event });
      if (kind === 'new') {
        useToastStore.getState().push({
          title: 'Yeni deprem kaydı',
          event,
          tone: event.magnitude >= 4 ? 'warn' : 'info',
        });
        if (s.soundOn && !s.muted) playBlip(event.magnitude);
        if (s.notifyThreshold > 0 && event.magnitude >= s.notifyThreshold) notifyEarthquake(event);
      }
    };

    const handleMessage = (raw: string) => {
      let msg: WsServerEvent;
      try {
        msg = JSON.parse(raw) as WsServerEvent;
      } catch {
        return;
      }
      store().markMessage();
      switch (msg.type) {
        case 'earthquake:new':
          handleEvent(msg.data, 'new');
          break;
        case 'earthquake:updated':
          handleEvent(msg.data, 'updated');
          break;
        case 'sources:status':
          queryClient.setQueryData(['sources'], msg.data);
          break;
        case 'activity:update':
          queryClient.setQueryData(['activity', 'every'], msg.data);
          for (const snap of msg.data) {
            queryClient.setQueryData(['activity', snap.region], [snap]);
          }
          break;
        case 'hello':
        case 'heartbeat':
          break;
      }
    };

    const startPolling = () => {
      if (pollTimer.current) return;
      store().setConnection('polling');
      const poll = async () => {
        try {
          const since = store().lastEventIso ?? new Date(Date.now() - 3_600_000).toISOString();
          const events = await api<Earthquake[]>(`/api/earthquakes/latest${qs({ since, limit: 50 })}`);
          store().markMessage();
          for (const event of [...events].reverse()) {
            const prev = seenRef.current.get(event.id);
            if (prev === undefined) handleEvent(event, 'new');
            else if (prev !== event.updatedAt) handleEvent(event, 'updated');
          }
        } catch {
          store().setConnection('down');
        }
      };
      void poll();
      pollTimer.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };

    const connect = () => {
      if (closedByUs.current) return;
      store().setConnection(reconnectAttempt.current === 0 ? 'connecting' : store().connection);
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = socket;
      socket.onopen = () => {
        reconnectAttempt.current = 0;
        stopPolling();
        store().setConnection('open');
        store().markMessage();
      };
      socket.onmessage = (ev) => handleMessage(String(ev.data));
      socket.onclose = () => {
        wsRef.current = null;
        if (!closedByUs.current) scheduleReconnect();
      };
      socket.onerror = () => {
        socket.close();
      };
    };

    const scheduleReconnect = () => {
      const attempt = reconnectAttempt.current;
      reconnectAttempt.current += 1;
      if (attempt >= 2) startPolling();
      const delay = RECONNECT_STEPS_MS[Math.min(attempt, RECONNECT_STEPS_MS.length - 1)]!;
      setTimeout(() => connect(), delay + Math.random() * 500);
    };

    connect();

    // Heartbeat watchdog: a silent-but-open socket is treated as dead.
    watchdog.current = setInterval(() => {
      const last = store().lastMessageAt;
      if (store().connection === 'open' && last !== null && Date.now() - last > HEARTBEAT_TIMEOUT_MS) {
        wsRef.current?.close();
      }
    }, 10_000);

    return () => {
      closedByUs.current = true;
      wsRef.current?.close();
      stopPolling();
      if (watchdog.current) clearInterval(watchdog.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return <>{children}</>;
}
