'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureNotificationPermission } from '@/lib/notify';
import { useLiveStore } from '@/stores/live-store';

/** Notification threshold (M3+/M4+/M5+) + live sound toggle (default OFF). */
export function NotifySettings() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const soundOn = useLiveStore((s) => s.soundOn);
  const setSoundOn = useLiveStore((s) => s.setSoundOn);
  const threshold = useLiveStore((s) => s.notifyThreshold);
  const setThreshold = useLiveStore((s) => s.setNotifyThreshold);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pickThreshold = async (value: 0 | 3 | 4 | 5) => {
    if (value > 0) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setThreshold(0);
        return;
      }
    }
    setThreshold(value);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Bildirim ayarları"
        aria-expanded={open}
        className="rounded-md border border-line p-1.5 text-txt-soft hover:text-txt focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        title="Bildirim ve ses ayarları"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11h11L12 8.5V6a4 4 0 0 0-4-4Zm-1.5 10a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-line bg-ink-700 p-3 shadow-panel">
          <p className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">Tarayıcı bildirimi eşiği</p>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {([0, 3, 4, 5] as const).map((v) => (
              <button
                key={v}
                onClick={() => void pickThreshold(v)}
                className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                  threshold === v
                    ? 'border-accent/60 bg-accent-soft text-accent'
                    : 'border-line text-txt-soft hover:bg-ink-600'
                }`}
              >
                {v === 0 ? 'Kapalı' : `M${v}+`}
              </button>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between text-xs text-txt-soft">
            <span>🔊 Live Alert (ses)</span>
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              className="h-4 w-4 accent-[#22D3EE]"
            />
          </label>
          <p className="mt-2 text-[10px] leading-relaxed text-txt-mute">
            Bildirim metinleri yalnızca kaydedilen ölçümleri aktarır; bu platform deprem tahmini yapmaz.
          </p>
        </div>
      )}
    </div>
  );
}
