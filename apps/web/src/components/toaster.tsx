'use client';

import { useEffect } from 'react';
import { MagnitudeBadge } from '@ils/ui';
import { fmtDepth } from '@/lib/format';
import { useToastStore, type Toast } from '@/stores/toast-store';

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), 6_500);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-72 animate-toast-in items-start gap-3 rounded-lg border p-3 shadow-panel backdrop-blur-md ${
        toast.tone === 'warn' ? 'border-status-warn/40 bg-ink-700/95' : 'border-line bg-ink-700/95'
      }`}
    >
      {toast.event ? <MagnitudeBadge magnitude={toast.event.magnitude} /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-txt">{toast.title}</p>
        {toast.event ? (
          <p className="mt-0.5 truncate text-xs text-txt-soft">
            {toast.event.location}
            <span className="text-txt-mute"> · {fmtDepth(toast.event.depthKm)}</span>
          </p>
        ) : null}
        {toast.body ? <p className="mt-0.5 text-xs text-txt-soft">{toast.body}</p> : null}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Bildirimi kapat"
        className="rounded p-0.5 text-txt-mute hover:text-txt focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        ✕
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
