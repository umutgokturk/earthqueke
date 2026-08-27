import { DISPLAY_TIME_ZONE } from '@ils/config';

const timeFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const shortFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const fmtTime = (iso: string): string => timeFmt.format(new Date(iso));
export const fmtDate = (iso: string): string => dateFmt.format(new Date(iso));
export const fmtDateTime = (iso: string): string => `${fmtDate(iso)} ${fmtTime(iso)}`;
export const fmtShort = (iso: string): string => shortFmt.format(new Date(iso));

export const fmtMag = (m: number): string => m.toFixed(1);
export const fmtDepth = (d: number): string => `${d.toFixed(1)} km`;
export const fmtKm = (d: number): string => `${d.toFixed(1)} km`;
export const fmtCoord = (c: number): string => c.toFixed(6);

export function relativeTime(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

export function ageHours(iso: string, nowMs: number = Date.now()): number {
  return Math.max(0, (nowMs - Date.parse(iso)) / 3_600_000);
}
