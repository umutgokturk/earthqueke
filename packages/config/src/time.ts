/**
 * Central timezone utilities.
 * Storage & transport: always UTC ISO strings. Display: Europe/Istanbul.
 */

export const DISPLAY_TIME_ZONE = 'Europe/Istanbul';

const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function toIso(d: Date | number | string): string {
  return new Date(d).toISOString();
}

/** dd.MM.yyyy in Europe/Istanbul. */
export function formatIstanbulDate(iso: string | Date): string {
  return dateFmt.format(new Date(iso));
}

/** HH:mm:ss in Europe/Istanbul. */
export function formatIstanbulTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatIstanbulDateTime(iso: string | Date): string {
  return `${formatIstanbulDate(iso)} ${formatIstanbulTime(iso)}`;
}

/**
 * Interpret a wall-clock timestamp expressed in Turkey time (UTC+3, no DST
 * since 2016) as a UTC instant. Used by providers that publish local time.
 */
export function turkeyLocalToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - 3 * 3_600_000;
  return new Date(ms).toISOString();
}

export function secondsSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}
