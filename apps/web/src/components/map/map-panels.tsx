'use client';

import Link from 'next/link';
import type { Earthquake } from '@ils/types';
import { DataClassBadge, MagnitudeBadge, Skeleton, SourceBadge } from '@ils/ui';
import { fmtCoord, fmtDepth, fmtDateTime, fmtKm, fmtMag } from '@/lib/format';
import { useFaultDetail, useRegionStats } from '@/lib/queries';

function PanelShell({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  return (
    <div className="w-72 rounded-lg border border-line bg-ink-800/95 shadow-panel backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">{title}</p>
        <button onClick={onClose} aria-label="Paneli kapat" className="rounded p-0.5 text-txt-mute hover:text-txt">
          ✕
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-txt-mute">{label}</span>
      <span className="text-right text-xs font-medium tabular-nums text-txt">{value}</span>
    </div>
  );
}

/** Marker detail panel (spec §11). */
export function EarthquakePanel({ event, onClose }: { event: Earthquake; onClose(): void }) {
  return (
    <PanelShell title="Deprem Detayı" onClose={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <MagnitudeBadge magnitude={event.magnitude} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-txt">{event.location}</span>
      </div>
      <DataClassBadge dataClass={event.dataClass} className="mb-2" />
      <Field label="Magnitude" value={`${fmtMag(event.magnitude)} ${event.magnitudeType ?? ''}`} />
      <Field label="Depth" value={fmtDepth(event.depthKm)} />
      <Field label="Time" value={fmtDateTime(event.occurredAt)} />
      <Field label="Latitude" value={fmtCoord(event.latitude)} />
      <Field label="Longitude" value={fmtCoord(event.longitude)} />
      <Field
        label="Source"
        value={
          <span className="flex justify-end gap-1">
            {event.sources.map((s) => (
              <SourceBadge key={s.source + s.sourceEventId} source={s.source} />
            ))}
          </span>
        }
      />
      <Field label="Istanbul Distance" value={fmtKm(event.istanbulDistanceKm)} />
      <Field
        label="Nearest Fault"
        value={
          event.nearestFaultName
            ? `${event.nearestFaultName} (${event.nearestFaultDistanceKm?.toFixed(1)} km)`
            : '—'
        }
      />
      <Link
        href={`/earthquakes/${event.id}`}
        className="mt-2 block rounded-md border border-accent/50 bg-accent-soft px-3 py-1.5 text-center text-xs font-semibold text-accent hover:bg-accent/20"
      >
        Detay sayfası →
      </Link>
    </PanelShell>
  );
}

/** Fault segment panel (spec §13). */
export function FaultPanel({ slug, onClose }: { slug: string; onClose(): void }) {
  const { data, isLoading } = useFaultDetail(slug);
  return (
    <PanelShell title="Fay Segmenti" onClose={onClose}>
      {isLoading || !data ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
      ) : (
        <>
          <p className="mb-1 text-sm font-bold text-txt">{data.name}</p>
          <p className="mb-2 text-[10px] text-status-warn">Yaklaşık geometri — bilimsel kullanım için değildir.</p>
          <Field label="Son 24 saat" value={`${data.counts.h24} deprem`} />
          <Field label="Son 7 gün" value={`${data.counts.d7} deprem`} />
          <Field label="Son 30 gün" value={`${data.counts.d30} deprem`} />
          <Field label="Maksimum" value={data.maxMagnitude !== null ? `M${fmtMag(data.maxMagnitude)}` : '—'} />
          <Field label="Ortalama" value={data.avgMagnitude !== null ? `M${fmtMag(data.avgMagnitude)}` : '—'} />
          <Field label="Ort. derinlik" value={data.avgDepthKm !== null ? `${data.avgDepthKm.toFixed(1)} km` : '—'} />
          <Link
            href={`/faults?fault=${data.slug}`}
            className="mt-2 block rounded-md border border-accent/50 bg-accent-soft px-3 py-1.5 text-center text-xs font-semibold text-accent hover:bg-accent/20"
          >
            Fay analizi →
          </Link>
        </>
      )}
    </PanelShell>
  );
}

/** District panel (spec §32). */
export function DistrictPanel({ slug, onClose }: { slug: string; onClose(): void }) {
  const { data, isLoading } = useRegionStats(slug);
  return (
    <PanelShell title="İlçe" onClose={onClose}>
      {isLoading || !data ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-full" />
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-txt">{data.name}</p>
          <Field label="Son 24 saat" value={`${data.counts.h24} olay`} />
          <Field label="Son 7 gün" value={`${data.counts.d7} olay`} />
          <Field label="Son 30 gün" value={`${data.counts.d30} olay`} />
          <Field label="Maksimum" value={data.maxMagnitude !== null ? `M${fmtMag(data.maxMagnitude)}` : '—'} />
          <Field label="Ortalama" value={data.avgMagnitude !== null ? `M${fmtMag(data.avgMagnitude)}` : '—'} />
          <Field label="Ort. derinlik" value={data.avgDepthKm !== null ? `${data.avgDepthKm.toFixed(1)} km` : '—'} />
          {data.nearestEvent && (
            <Field
              label="En yakın deprem"
              value={`M${fmtMag(data.nearestEvent.magnitude)} · ${fmtKm(data.nearestEvent.distanceKm)}`}
            />
          )}
          <Link
            href={`/earthquakes?region=${data.slug}`}
            className="mt-2 block rounded-md border border-accent/50 bg-accent-soft px-3 py-1.5 text-center text-xs font-semibold text-accent hover:bg-accent/20"
          >
            İlçe depremleri →
          </Link>
        </>
      )}
    </PanelShell>
  );
}
