import { formatIstanbulDate, formatIstanbulTime } from '@ils/config';
import type { Earthquake } from '@ils/types';

const HEADER = [
  'id',
  'date',
  'time',
  'magnitude',
  'depth',
  'latitude',
  'longitude',
  'location',
  'source',
  'nearest_fault',
  'distance_to_fault',
  'istanbul_distance_km',
  'data_class',
];

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export (spec §36). Dates/times are rendered in Europe/Istanbul; the
 * UTF-8 BOM keeps Excel happy with Turkish characters.
 */
export function earthquakesToCsv(events: Earthquake[]): string {
  const lines: string[] = ['﻿' + HEADER.join(',')];
  for (const e of events) {
    lines.push(
      [
        cell(e.id),
        cell(formatIstanbulDate(e.occurredAt)),
        cell(formatIstanbulTime(e.occurredAt)),
        cell(e.magnitude.toFixed(1)),
        cell(e.depthKm.toFixed(1)),
        cell(e.latitude.toFixed(6)),
        cell(e.longitude.toFixed(6)),
        cell(e.location),
        cell(e.sources.map((s) => s.source).join('|') || e.source),
        cell(e.nearestFaultName),
        cell(e.nearestFaultDistanceKm === null ? '' : e.nearestFaultDistanceKm.toFixed(2)),
        cell(e.istanbulDistanceKm.toFixed(2)),
        cell(e.dataClass),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}
