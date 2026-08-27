import { randomUUID } from 'node:crypto';
import { FAULT_ASSOCIATION_KM, ISTANBUL_CENTER, SOURCE_META } from '@ils/config';
import { FAULT_SEEDS, REGION_SEEDS } from '@ils/gis';
import type {
  ActivitySnapshot,
  DashboardStats,
  DataSourceStatus,
  DistributionBin,
  DistributionKind,
  Earthquake,
  EarthquakeQuery,
  EarthquakeReport,
  EarthquakeSourceRecord,
  FaultSegment,
  FaultStats,
  IngestionRun,
  Paginated,
  Region,
  RegionKind,
  RegionStats,
  ScatterPoint,
  SearchResult,
  SourceId,
  TimelineBucket,
} from '@ils/types';
import { ACTIVITY_DISCLAIMER, rangeToMs } from '@ils/types';
import type pg from 'pg';
import type { PgPool } from './pool';
import { computeDistribution, fillTimeline, pickCanonical, round2, type DistRow } from './shared';
import type {
  CandidateQuery,
  DataStore,
  FaultUpsert,
  MergeResult,
  StoreQueryOptions,
  TimelineQuery,
} from './store';

type Queryable = pg.Pool | pg.PoolClient;

const EVENT_SELECT = `
  SELECT
    e.id, e.occurred_at, e.latitude, e.longitude, e.depth_km, e.magnitude, e.magnitude_type,
    e.location, e.source, e.data_class, e.istanbul_distance_km,
    e.nearest_fault_id, e.nearest_fault_distance_km,
    f.slug AS nearest_fault_slug, f.name AS nearest_fault_name,
    e.district_slug, dr.name AS district_name, e.in_istanbul, e.in_marmara_sea,
    e.created_at, e.updated_at,
    COALESCE(s.sources, '[]'::jsonb) AS sources
  FROM earthquakes e
  LEFT JOIN fault_segments f ON f.id = e.nearest_fault_id
  LEFT JOIN regions dr ON dr.slug = e.district_slug AND dr.kind = 'district'
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'source', es.source,
      'sourceEventId', es.source_event_id,
      'occurredAt', es.occurred_at,
      'latitude', es.latitude,
      'longitude', es.longitude,
      'depthKm', es.depth_km,
      'magnitude', es.magnitude,
      'magnitudeType', es.magnitude_type,
      'location', es.location,
      'firstSeenAt', es.first_seen_at,
      'lastSeenAt', es.last_seen_at
    ) ORDER BY es.first_seen_at) AS sources
    FROM earthquake_sources es
    WHERE es.earthquake_id = e.id
  ) s ON TRUE
`;

interface Filter {
  where: string;
  params: unknown[];
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}
function isoOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : iso(v);
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}
function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapEventRow(row: any): Earthquake {
  const sources: EarthquakeSourceRecord[] = ((row.sources ?? []) as any[]).map((s) => ({
    source: s.source,
    sourceEventId: s.sourceEventId,
    occurredAt: iso(s.occurredAt),
    latitude: num(s.latitude),
    longitude: num(s.longitude),
    depthKm: num(s.depthKm),
    magnitude: num(s.magnitude),
    magnitudeType: s.magnitudeType ?? undefined,
    location: s.location ?? '',
    firstSeenAt: iso(s.firstSeenAt),
    lastSeenAt: iso(s.lastSeenAt),
  }));
  return {
    id: row.id,
    occurredAt: iso(row.occurred_at),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    depthKm: num(row.depth_km),
    magnitude: num(row.magnitude),
    magnitudeType: row.magnitude_type ?? undefined,
    location: row.location ?? '',
    source: row.source,
    dataClass: row.data_class,
    sources,
    istanbulDistanceKm: num(row.istanbul_distance_km),
    nearestFaultId: row.nearest_fault_id ?? null,
    nearestFaultSlug: row.nearest_fault_slug ?? null,
    nearestFaultName: row.nearest_fault_name ?? null,
    nearestFaultDistanceKm: numOrNull(row.nearest_fault_distance_km),
    districtSlug: row.district_slug ?? null,
    districtName: row.district_name ?? null,
    inIstanbul: Boolean(row.in_istanbul),
    inMarmaraSea: Boolean(row.in_marmara_sea),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapFaultRow(row: any): FaultSegment {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
    segmentType: row.segment_type ?? '',
    description: row.description ?? '',
    approximate: Boolean(row.approximate),
    isZone: Boolean(row.is_zone),
    source: row.source ?? '',
    sourceUrl: row.source_url ?? '',
    license: row.license ?? '',
    lastVerified: row.last_verified
      ? row.last_verified instanceof Date
        ? row.last_verified.toISOString().slice(0, 10)
        : String(row.last_verified).slice(0, 10)
      : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapRegionRow(row: any): Region {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind as RegionKind,
    geometry: row.geometry ? (typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry) : null,
    centroid: { latitude: num(row.centroid_lat), longitude: num(row.centroid_lon) },
    radiusKm: numOrNull(row.radius_km),
    approximate: Boolean(row.approximate),
    source: row.source ?? '',
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * PostgreSQL + PostGIS DataStore. Spatial work (nearest fault, containment,
 * distances) runs in SQL via ST_Distance / ST_DWithin / ST_Intersects with
 * GIST indexes; time bucketing aligns with the shared epoch-ms convention so
 * results match the in-memory store exactly.
 */
export class PgStore implements DataStore {
  readonly mode = 'postgres' as const;

  constructor(private pool: PgPool) {}

  async init(): Promise<void> {
    await this.pool.query('SELECT 1');
    await this.ensureRegistry();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number | null }> {
    const t0 = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch {
      return { ok: false, latencyMs: null };
    }
  }

  /** Idempotently seed sources / faults / regions so a fresh database works. */
  private async ensureRegistry(): Promise<void> {
    for (const id of ['AFAD', 'KANDILLI', 'MOCK'] as SourceId[]) {
      const meta = SOURCE_META[id];
      await this.pool.query(
        `INSERT INTO data_sources (id, name, attribution, url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, meta.name, meta.attribution, meta.url],
      );
    }
    const faultCount = await this.pool.query('SELECT COUNT(*)::int AS c FROM fault_segments');
    if (faultCount.rows[0].c === 0) {
      for (const f of FAULT_SEEDS) {
        await this.upsertFault({ ...f, lastVerified: f.lastVerified });
      }
    }
    const regionCount = await this.pool.query('SELECT COUNT(*)::int AS c FROM regions');
    if (regionCount.rows[0].c === 0) {
      for (const r of REGION_SEEDS) {
        await this.pool.query(
          `INSERT INTO regions (slug, name, kind, geometry, centroid, radius_km, approximate, source)
           VALUES ($1, $2, $3,
                   CASE WHEN $4::text IS NULL THEN NULL ELSE ST_GeomFromGeoJSON($4::text)::geography END,
                   ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
                   $7, $8, $9)
           ON CONFLICT (slug) DO NOTHING`,
          [
            r.slug,
            r.name,
            r.kind,
            r.geometry ? JSON.stringify(r.geometry) : null,
            r.centroid.longitude,
            r.centroid.latitude,
            r.radiusKm,
            r.approximate,
            r.source,
          ],
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // enrichment (PostGIS)
  // ─────────────────────────────────────────────────────────

  private async enrich(db: Queryable, lat: number, lon: number) {
    const res = await db.query(
      `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS g)
       SELECT
         ST_Distance((SELECT g FROM p), ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) / 1000.0 AS istanbul_km,
         nf.id AS fault_id, nf.slug AS fault_slug, nf.name AS fault_name, nf.dist_km AS fault_km,
         COALESCE(ist.hit, FALSE) AS in_istanbul,
         COALESCE(sea.hit, FALSE) AS in_marmara,
         d.slug AS district_slug, d.name AS district_name
       FROM p
       LEFT JOIN LATERAL (
         SELECT fs.id, fs.slug, fs.name, ST_Distance(fs.geometry, p.g) / 1000.0 AS dist_km
         FROM fault_segments fs
         WHERE NOT fs.is_zone
         ORDER BY ST_Distance(fs.geometry, p.g)
         LIMIT 1
       ) nf ON TRUE
       LEFT JOIN LATERAL (
         SELECT TRUE AS hit FROM regions r
         WHERE r.slug = 'istanbul' AND r.geometry IS NOT NULL AND ST_Intersects(r.geometry, p.g)
         LIMIT 1
       ) ist ON TRUE
       LEFT JOIN LATERAL (
         SELECT TRUE AS hit FROM regions r
         WHERE r.slug = 'marmara' AND r.geometry IS NOT NULL AND ST_Intersects(r.geometry, p.g)
         LIMIT 1
       ) sea ON TRUE
       LEFT JOIN LATERAL (
         SELECT r.slug, r.name FROM regions r
         WHERE r.kind = 'district' AND r.radius_km IS NOT NULL
           AND ST_DWithin(r.centroid, p.g, r.radius_km * 1000.0)
         ORDER BY ST_Distance(r.centroid, p.g)
         LIMIT 1
       ) d ON TRUE`,
      [lon, lat, ISTANBUL_CENTER.longitude, ISTANBUL_CENTER.latitude],
    );
    const row = res.rows[0];
    return {
      istanbulDistanceKm: round2(num(row.istanbul_km)),
      nearestFaultId: (row.fault_id as string | null) ?? null,
      nearestFaultDistanceKm: row.fault_km === null ? null : round2(num(row.fault_km)),
      districtSlug: (row.district_slug as string | null) ?? null,
      inIstanbul: Boolean(row.in_istanbul),
      inMarmaraSea: Boolean(row.in_marmara),
    };
  }

  // ─────────────────────────────────────────────────────────
  // filters
  // ─────────────────────────────────────────────────────────

  private async buildFilter(q: EarthquakeQuery, opts: StoreQueryOptions, startIndex = 1): Promise<Filter> {
    const conds: string[] = [];
    const params: unknown[] = [];
    let i = startIndex;
    const push = (cond: string, ...vals: unknown[]) => {
      conds.push(cond);
      params.push(...vals);
      i += vals.length;
    };

    const from = q.from ?? (q.range ? new Date(Date.now() - rangeToMs(q.range)).toISOString() : undefined);
    if (from) push(`e.occurred_at >= $${i}`, from);
    if (q.to) push(`e.occurred_at <= $${i}`, q.to);
    if (q.minMagnitude !== undefined) push(`e.magnitude >= $${i}`, q.minMagnitude);
    if (q.maxMagnitude !== undefined) push(`e.magnitude <= $${i}`, q.maxMagnitude);
    if (q.minDepth !== undefined) push(`e.depth_km >= $${i}`, q.minDepth);
    if (q.maxDepth !== undefined) push(`e.depth_km < $${i}`, q.maxDepth);
    if (!opts.includeSynthetic) push(`e.data_class = 'live'`);
    if (q.source && q.source !== 'ALL') {
      push(
        `EXISTS (SELECT 1 FROM earthquake_sources qes WHERE qes.earthquake_id = e.id AND qes.source = $${i})`,
        q.source,
      );
    }
    if (q.faultId) {
      push(
        `e.nearest_fault_id IN (SELECT ff.id FROM fault_segments ff WHERE ff.id::text = $${i} OR ff.slug = $${i})`,
        q.faultId,
      );
    }
    if (q.region && q.region !== 'all') {
      if (q.region === 'istanbul') push('e.in_istanbul');
      else if (q.region === 'marmara') push('e.in_marmara_sea');
      else {
        const region = await this.getRegion(q.region);
        if (region?.kind === 'district') push(`e.district_slug = $${i}`, q.region);
        else if (region?.geometry) {
          push(
            `EXISTS (SELECT 1 FROM regions qr WHERE qr.slug = $${i} AND qr.geometry IS NOT NULL AND ST_Intersects(qr.geometry, e.geom))`,
            q.region,
          );
        } else if (region && region.radiusKm !== null) {
          push(
            `EXISTS (SELECT 1 FROM regions qr WHERE qr.slug = $${i} AND ST_DWithin(qr.centroid, e.geom, qr.radius_km * 1000.0))`,
            q.region,
          );
        } else {
          push('FALSE');
        }
      }
    }
    if (q.search && q.search.trim()) {
      const like = `%${q.search.trim()}%`;
      push(
        `(e.location ILIKE $${i} OR e.id::text ILIKE $${i} OR e.district_slug ILIKE $${i}
          OR EXISTS (SELECT 1 FROM fault_segments sf WHERE sf.id = e.nearest_fault_id AND sf.name ILIKE $${i}))`,
        like,
      );
    }
    return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
  }

  // ─────────────────────────────────────────────────────────
  // ingestion primitives
  // ─────────────────────────────────────────────────────────

  async getBySourceEvent(source: SourceId, sourceEventId: string): Promise<Earthquake | null> {
    const res = await this.pool.query(
      `${EVENT_SELECT}
       WHERE e.id = (SELECT es2.earthquake_id FROM earthquake_sources es2
                     WHERE es2.source = $1 AND es2.source_event_id = $2 LIMIT 1)`,
      [source, sourceEventId],
    );
    return res.rows[0] ? mapEventRow(res.rows[0]) : null;
  }

  async getCandidates(q: CandidateQuery): Promise<Earthquake[]> {
    const t = Date.parse(q.occurredAt);
    const from = new Date(t - q.toleranceSeconds * 1000).toISOString();
    const to = new Date(t + q.toleranceSeconds * 1000).toISOString();
    const res = await this.pool.query(
      `${EVENT_SELECT}
       WHERE e.occurred_at BETWEEN $1 AND $2
         AND ST_DWithin(e.geom, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5 * 1000.0)
       ORDER BY e.occurred_at DESC
       LIMIT 20`,
      [from, to, q.longitude, q.latitude, q.radiusKm],
    );
    return res.rows.map(mapEventRow);
  }

  async insertEvent(report: EarthquakeReport): Promise<Earthquake> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const enrich = await this.enrich(client, report.latitude, report.longitude);
      const id = randomUUID();
      await client.query(
        `INSERT INTO earthquakes
           (id, occurred_at, latitude, longitude, depth_km, magnitude, magnitude_type, location,
            source, data_class, geom, istanbul_distance_km, nearest_fault_id, nearest_fault_distance_km,
            district_slug, in_istanbul, in_marmara_sea)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography,
                 $13, $14, $15, $16, $17, $18)`,
        [
          id,
          report.occurredAt,
          report.latitude,
          report.longitude,
          report.depthKm,
          report.magnitude,
          report.magnitudeType ?? null,
          report.location,
          report.source,
          report.dataClass ?? 'live',
          report.longitude,
          report.latitude,
          enrich.istanbulDistanceKm,
          enrich.nearestFaultId,
          enrich.nearestFaultDistanceKm,
          enrich.districtSlug,
          enrich.inIstanbul,
          enrich.inMarmaraSea,
        ],
      );
      await client.query(
        `INSERT INTO earthquake_sources
           (earthquake_id, source, source_event_id, occurred_at, latitude, longitude, depth_km,
            magnitude, magnitude_type, location, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          report.source,
          report.sourceEventId ?? report.id,
          report.occurredAt,
          report.latitude,
          report.longitude,
          report.depthKm,
          report.magnitude,
          report.magnitudeType ?? null,
          report.location,
          report.rawPayload === undefined ? null : JSON.stringify(report.rawPayload),
        ],
      );
      await client.query('COMMIT');
      const created = await this.getEarthquake(id);
      return created!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async mergeReport(eventId: string, report: EarthquakeReport): Promise<MergeResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const beforeRes = await client.query(
        'SELECT occurred_at, latitude, longitude, depth_km, magnitude, location, source FROM earthquakes WHERE id = $1 FOR UPDATE',
        [eventId],
      );
      if (beforeRes.rowCount === 0) throw new Error(`mergeReport: unknown event ${eventId}`);
      const before = beforeRes.rows[0];

      await client.query(
        `INSERT INTO earthquake_sources
           (earthquake_id, source, source_event_id, occurred_at, latitude, longitude, depth_km,
            magnitude, magnitude_type, location, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (source, source_event_id) DO UPDATE SET
           occurred_at = EXCLUDED.occurred_at,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           depth_km = EXCLUDED.depth_km,
           magnitude = EXCLUDED.magnitude,
           magnitude_type = EXCLUDED.magnitude_type,
           location = EXCLUDED.location,
           raw_payload = EXCLUDED.raw_payload,
           last_seen_at = NOW()`,
        [
          eventId,
          report.source,
          report.sourceEventId ?? report.id,
          report.occurredAt,
          report.latitude,
          report.longitude,
          report.depthKm,
          report.magnitude,
          report.magnitudeType ?? null,
          report.location,
          report.rawPayload === undefined ? null : JSON.stringify(report.rawPayload),
        ],
      );

      const sourcesRes = await client.query(
        `SELECT source, source_event_id, occurred_at, latitude, longitude, depth_km, magnitude,
                magnitude_type, location, first_seen_at, last_seen_at
         FROM earthquake_sources WHERE earthquake_id = $1`,
        [eventId],
      );
      const records: EarthquakeSourceRecord[] = sourcesRes.rows.map((r) => ({
        source: r.source,
        sourceEventId: r.source_event_id,
        occurredAt: iso(r.occurred_at),
        latitude: num(r.latitude),
        longitude: num(r.longitude),
        depthKm: num(r.depth_km),
        magnitude: num(r.magnitude),
        magnitudeType: r.magnitude_type ?? undefined,
        location: r.location ?? '',
        firstSeenAt: iso(r.first_seen_at),
        lastSeenAt: iso(r.last_seen_at),
      }));
      const canonical = pickCanonical(records);
      const enrich = await this.enrich(client, canonical.latitude, canonical.longitude);
      await client.query(
        `UPDATE earthquakes SET
           occurred_at = $2, latitude = $3, longitude = $4, depth_km = $5, magnitude = $6,
           magnitude_type = $7, location = $8, source = $9,
           data_class = CASE WHEN $10 = 'live' THEN 'live' ELSE data_class END,
           geom = ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
           istanbul_distance_km = $11, nearest_fault_id = $12, nearest_fault_distance_km = $13,
           district_slug = $14, in_istanbul = $15, in_marmara_sea = $16, updated_at = NOW()
         WHERE id = $1`,
        [
          eventId,
          canonical.occurredAt,
          canonical.latitude,
          canonical.longitude,
          canonical.depthKm,
          canonical.magnitude,
          canonical.magnitudeType ?? null,
          canonical.location,
          canonical.source,
          report.dataClass ?? 'live',
          enrich.istanbulDistanceKm,
          enrich.nearestFaultId,
          enrich.nearestFaultDistanceKm,
          enrich.districtSlug,
          enrich.inIstanbul,
          enrich.inMarmaraSea,
        ],
      );
      await client.query('COMMIT');

      const changed =
        iso(before.occurred_at) !== canonical.occurredAt ||
        num(before.latitude) !== canonical.latitude ||
        num(before.longitude) !== canonical.longitude ||
        num(before.depth_km) !== canonical.depthKm ||
        num(before.magnitude) !== canonical.magnitude ||
        (before.location ?? '') !== canonical.location ||
        before.source !== canonical.source;

      const event = await this.getEarthquake(eventId);
      return { event: event!, changed };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─────────────────────────────────────────────────────────
  // querying
  // ─────────────────────────────────────────────────────────

  async getEarthquake(id: string): Promise<Earthquake | null> {
    const res = await this.pool.query(`${EVENT_SELECT} WHERE e.id::text = $1`, [id]);
    return res.rows[0] ? mapEventRow(res.rows[0]) : null;
  }

  async queryEarthquakes(q: EarthquakeQuery, opts: StoreQueryOptions): Promise<Paginated<Earthquake>> {
    const limit = Math.min(q.limit ?? 50, 500);
    const offset = q.offset ?? 0;
    const filter = await this.buildFilter(q, opts);
    const order =
      q.order === 'magnitude_desc'
        ? 'e.magnitude DESC, e.occurred_at DESC'
        : q.order === 'time_asc'
          ? 'e.occurred_at ASC'
          : 'e.occurred_at DESC';
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS c FROM earthquakes e ${filter.where}`,
      filter.params,
    );
    const res = await this.pool.query(
      `${EVENT_SELECT} ${filter.where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
      filter.params,
    );
    return { items: res.rows.map(mapEventRow), total: countRes.rows[0].c, limit, offset };
  }

  async latestEarthquakes(limit: number, sinceIso: string | undefined, opts: StoreQueryOptions): Promise<Earthquake[]> {
    const filter = await this.buildFilter({ from: sinceIso }, opts);
    const res = await this.pool.query(
      `${EVENT_SELECT} ${filter.where} ORDER BY e.occurred_at DESC LIMIT ${Math.min(limit, 500)}`,
      filter.params,
    );
    return res.rows.map(mapEventRow);
  }

  async nearbyEarthquakes(
    lat: number,
    lon: number,
    radiusKm: number,
    days: number,
    excludeId: string | undefined,
    opts: StoreQueryOptions,
  ): Promise<Earthquake[]> {
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const synthetic = opts.includeSynthetic ? '' : `AND e.data_class = 'live'`;
    const res = await this.pool.query(
      `${EVENT_SELECT}
       WHERE e.occurred_at >= $1
         AND ST_DWithin(e.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4 * 1000.0)
         AND ($5::text IS NULL OR e.id::text <> $5)
         ${synthetic}
       ORDER BY e.occurred_at DESC
       LIMIT 200`,
      [from, lon, lat, radiusKm, excludeId ?? null],
    );
    return res.rows.map(mapEventRow);
  }

  async dashboardStats(region: string | undefined, opts: StoreQueryOptions): Promise<DashboardStats> {
    const now = Date.now();
    const from30 = new Date(now - 30 * 86_400_000).toISOString();
    const filter = await this.buildFilter({ from: from30, region }, opts);
    const p = filter.params.length;
    const countsRes = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE e.occurred_at >= $${p + 1})::int AS h1,
         COUNT(*) FILTER (WHERE e.occurred_at >= $${p + 2})::int AS h24,
         COUNT(*) FILTER (WHERE e.occurred_at >= $${p + 3})::int AS d7,
         COUNT(*)::int AS d30,
         MAX(e.occurred_at) AS last_event,
         AVG(e.depth_km) FILTER (WHERE e.occurred_at >= $${p + 2}) AS avg_depth_24h
       FROM earthquakes e ${filter.where}`,
      [
        ...filter.params,
        new Date(now - 3_600_000).toISOString(),
        new Date(now - 86_400_000).toISOString(),
        new Date(now - 7 * 86_400_000).toISOString(),
      ],
    );
    const c = countsRes.rows[0];

    const filter24 = await this.buildFilter({ from: new Date(now - 86_400_000).toISOString(), region }, opts);
    const maxRes = await this.pool.query(
      `${EVENT_SELECT} ${filter24.where} ORDER BY e.magnitude DESC, e.occurred_at DESC LIMIT 1`,
      filter24.params,
    );
    const nearestRes = await this.pool.query(
      `${EVENT_SELECT} ${filter24.where} ORDER BY e.istanbul_distance_km ASC LIMIT 1`,
      filter24.params,
    );
    const maxEvent = maxRes.rows[0] ? mapEventRow(maxRes.rows[0]) : null;
    const nearestEvent = nearestRes.rows[0] ? mapEventRow(nearestRes.rows[0]) : null;

    return {
      counts: { h1: c.h1, h24: c.h24, d7: c.d7, d30: c.d30 },
      maxMagnitude24h: maxEvent ? { value: maxEvent.magnitude, event: maxEvent } : null,
      avgDepthKm24h: c.avg_depth_24h === null ? null : round2(num(c.avg_depth_24h)),
      nearestToIstanbul24h: nearestEvent
        ? { distanceKm: nearestEvent.istanbulDistanceKm, event: nearestEvent }
        : null,
      lastEventAt: isoOrNull(c.last_event),
      generatedAt: new Date(now).toISOString(),
    };
  }

  async timeline(q: TimelineQuery): Promise<TimelineBucket[]> {
    const filter = await this.buildFilter(
      { from: q.from, to: q.to, region: q.region, minMagnitude: q.minMagnitude },
      { includeSynthetic: q.includeSynthetic },
    );
    const p = filter.params.length;
    const res = await this.pool.query(
      `SELECT (FLOOR(EXTRACT(EPOCH FROM e.occurred_at) * 1000 / $${p + 1}) * $${p + 1})::float8 AS bucket_ms,
              COUNT(*)::int AS count, MAX(e.magnitude) AS max_m, SUM(e.magnitude) AS sum_m, SUM(e.depth_km) AS sum_d
       FROM earthquakes e ${filter.where}
       GROUP BY bucket_ms ORDER BY bucket_ms`,
      [...filter.params, q.bucketMs],
    );
    const sparse = new Map<number, { count: number; maxMagnitude: number | null; sumMagnitude: number; sumDepth: number }>();
    for (const row of res.rows) {
      sparse.set(num(row.bucket_ms), {
        count: row.count,
        maxMagnitude: numOrNull(row.max_m),
        sumMagnitude: num(row.sum_m),
        sumDepth: num(row.sum_d),
      });
    }
    return fillTimeline(sparse, Date.parse(q.from), Date.parse(q.to), q.bucketMs);
  }

  async distribution(
    kind: DistributionKind,
    from: string,
    to: string,
    region: string | undefined,
    opts: StoreQueryOptions,
  ): Promise<DistributionBin[]> {
    const filter = await this.buildFilter({ from, to, region }, opts);
    const res = await this.pool.query(
      `SELECT e.occurred_at, e.magnitude, e.depth_km, e.nearest_fault_distance_km,
              f.slug AS fault_slug, f.name AS fault_name, e.district_slug, dr.name AS district_name
       FROM earthquakes e
       LEFT JOIN fault_segments f ON f.id = e.nearest_fault_id
       LEFT JOIN regions dr ON dr.slug = e.district_slug AND dr.kind = 'district'
       ${filter.where}
       LIMIT 100000`,
      filter.params,
    );
    const rows: DistRow[] = res.rows.map((r) => ({
      occurredAt: iso(r.occurred_at),
      magnitude: num(r.magnitude),
      depthKm: num(r.depth_km),
      faultSlug: r.fault_slug ?? null,
      faultName: r.fault_name ?? null,
      faultDistanceKm: numOrNull(r.nearest_fault_distance_km),
      districtSlug: r.district_slug ?? null,
      districtName: r.district_name ?? null,
    }));
    return computeDistribution(kind, rows, Date.parse(from), Date.parse(to), FAULT_ASSOCIATION_KM);
  }

  async scatter(
    from: string,
    to: string,
    region: string | undefined,
    limit: number,
    opts: StoreQueryOptions,
  ): Promise<ScatterPoint[]> {
    const filter = await this.buildFilter({ from, to, region }, opts);
    const res = await this.pool.query(
      `SELECT e.id, e.occurred_at, e.magnitude, e.depth_km
       FROM earthquakes e ${filter.where}
       ORDER BY e.occurred_at DESC LIMIT ${Math.min(limit, 2000)}`,
      filter.params,
    );
    return res.rows.map((r) => ({ id: r.id, t: iso(r.occurred_at), magnitude: num(r.magnitude), depthKm: num(r.depth_km) }));
  }

  async eventsForActivity(region: string | undefined, opts: StoreQueryOptions) {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const filter = await this.buildFilter({ from, region }, opts);
    const res = await this.pool.query(
      `SELECT e.occurred_at, e.magnitude, e.depth_km, e.latitude, e.longitude
       FROM earthquakes e ${filter.where} LIMIT 100000`,
      filter.params,
    );
    return res.rows.map((r) => ({
      occurredAt: iso(r.occurred_at),
      magnitude: num(r.magnitude),
      depthKm: num(r.depth_km),
      latitude: num(r.latitude),
      longitude: num(r.longitude),
    }));
  }

  // ─────────────────────────────────────────────────────────
  // faults
  // ─────────────────────────────────────────────────────────

  private readonly faultSelect = `
    SELECT id, name, slug, ST_AsGeoJSON(geometry::geometry) AS geometry, segment_type, description,
           approximate, is_zone, source, source_url, license, last_verified, created_at, updated_at
    FROM fault_segments`;

  async listFaults(): Promise<FaultSegment[]> {
    const res = await this.pool.query(`${this.faultSelect} ORDER BY name`);
    return res.rows.map(mapFaultRow);
  }

  async getFault(idOrSlug: string): Promise<FaultSegment | null> {
    const res = await this.pool.query(`${this.faultSelect} WHERE id::text = $1 OR slug = $1 LIMIT 1`, [idOrSlug]);
    return res.rows[0] ? mapFaultRow(res.rows[0]) : null;
  }

  async upsertFault(input: FaultUpsert): Promise<FaultSegment> {
    const res = await this.pool.query(
      `INSERT INTO fault_segments
         (name, slug, geometry, segment_type, description, approximate, is_zone, source, source_url, license, last_verified)
       VALUES ($1, $2, ST_GeomFromGeoJSON($3)::geography, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         geometry = EXCLUDED.geometry,
         segment_type = EXCLUDED.segment_type,
         description = EXCLUDED.description,
         approximate = EXCLUDED.approximate,
         is_zone = EXCLUDED.is_zone,
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         license = EXCLUDED.license,
         last_verified = EXCLUDED.last_verified,
         updated_at = NOW()
       RETURNING id`,
      [
        input.name,
        input.slug,
        JSON.stringify(input.geometry),
        input.segmentType,
        input.description,
        input.approximate,
        input.isZone,
        input.source,
        input.sourceUrl,
        input.license,
        input.lastVerified,
      ],
    );
    return (await this.getFault(res.rows[0].id))!;
  }

  async deleteFault(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM fault_segments WHERE id::text = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async faultStats(faultId: string, opts: StoreQueryOptions): Promise<FaultStats | null> {
    const fault = await this.getFault(faultId);
    if (!fault) return null;
    const now = Date.now();
    const synthetic = opts.includeSynthetic ? '' : `AND e.data_class = 'live'`;
    const res = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE e.occurred_at >= $2)::int AS h24,
         COUNT(*) FILTER (WHERE e.occurred_at >= $3)::int AS d7,
         COUNT(*) FILTER (WHERE e.occurred_at >= $4)::int AS d30,
         COUNT(*)::int AS total,
         MAX(e.magnitude) FILTER (WHERE e.occurred_at >= $4) AS max_m,
         AVG(e.magnitude) FILTER (WHERE e.occurred_at >= $4) AS avg_m,
         AVG(e.depth_km) FILTER (WHERE e.occurred_at >= $4) AS avg_d,
         MAX(e.occurred_at) AS last_event
       FROM earthquakes e
       WHERE e.nearest_fault_id = $1 AND e.nearest_fault_distance_km <= $5 ${synthetic}`,
      [
        fault.id,
        new Date(now - 86_400_000).toISOString(),
        new Date(now - 7 * 86_400_000).toISOString(),
        new Date(now - 30 * 86_400_000).toISOString(),
        FAULT_ASSOCIATION_KM,
      ],
    );
    const closestRes = await this.pool.query(
      `SELECT e.id, e.nearest_fault_distance_km, e.magnitude, e.occurred_at
       FROM earthquakes e
       WHERE e.nearest_fault_id = $1 AND e.nearest_fault_distance_km <= $2 ${synthetic}
       ORDER BY e.nearest_fault_distance_km ASC LIMIT 1`,
      [fault.id, FAULT_ASSOCIATION_KM],
    );
    const r = res.rows[0];
    const closest = closestRes.rows[0];
    return {
      faultId: fault.id,
      slug: fault.slug,
      name: fault.name,
      counts: { h24: r.h24, d7: r.d7, d30: r.d30, total: r.total },
      maxMagnitude: r.max_m === null ? null : round2(num(r.max_m)),
      avgMagnitude: r.avg_m === null ? null : round2(num(r.avg_m)),
      avgDepthKm: r.avg_d === null ? null : round2(num(r.avg_d)),
      lastEventAt: isoOrNull(r.last_event),
      closestEvent: closest
        ? {
            id: closest.id,
            distanceKm: round2(num(closest.nearest_fault_distance_km)),
            magnitude: num(closest.magnitude),
            occurredAt: iso(closest.occurred_at),
          }
        : null,
    };
  }

  async allFaultStats(opts: StoreQueryOptions): Promise<FaultStats[]> {
    const faults = await this.listFaults();
    const out: FaultStats[] = [];
    for (const f of faults) {
      if (f.isZone) continue;
      const s = await this.faultStats(f.id, opts);
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.counts.d30 - a.counts.d30);
  }

  // ─────────────────────────────────────────────────────────
  // regions
  // ─────────────────────────────────────────────────────────

  private readonly regionSelect = `
    SELECT id, slug, name, kind,
           CASE WHEN geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(geometry::geometry) END AS geometry,
           ST_Y(centroid::geometry) AS centroid_lat, ST_X(centroid::geometry) AS centroid_lon,
           radius_km, approximate, source
    FROM regions`;

  async listRegions(): Promise<Region[]> {
    const res = await this.pool.query(`${this.regionSelect} ORDER BY kind, name`);
    return res.rows.map(mapRegionRow);
  }

  async getRegion(slug: string): Promise<Region | null> {
    const res = await this.pool.query(`${this.regionSelect} WHERE slug = $1`, [slug]);
    return res.rows[0] ? mapRegionRow(res.rows[0]) : null;
  }

  async regionStats(slug: string, opts: StoreQueryOptions): Promise<RegionStats | null> {
    const region = await this.getRegion(slug);
    if (!region) return null;
    const now = Date.now();
    const from30 = new Date(now - 30 * 86_400_000).toISOString();
    const filter = await this.buildFilter({ from: from30, region: slug }, opts);
    const p = filter.params.length;
    const res = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE e.occurred_at >= $${p + 1})::int AS h24,
         COUNT(*) FILTER (WHERE e.occurred_at >= $${p + 2})::int AS d7,
         COUNT(*)::int AS d30,
         MAX(e.magnitude) AS max_m, AVG(e.magnitude) AS avg_m, AVG(e.depth_km) AS avg_d,
         MAX(e.occurred_at) AS last_event
       FROM earthquakes e ${filter.where}`,
      [
        ...filter.params,
        new Date(now - 86_400_000).toISOString(),
        new Date(now - 7 * 86_400_000).toISOString(),
      ],
    );
    const nearestRes = await this.pool.query(
      `SELECT e.id, e.magnitude, e.occurred_at,
              ST_Distance(e.geom, ST_SetSRID(ST_MakePoint($${p + 1}, $${p + 2}), 4326)::geography) / 1000.0 AS d
       FROM earthquakes e ${filter.where}
       ORDER BY d ASC LIMIT 1`,
      [...filter.params, region.centroid.longitude, region.centroid.latitude],
    );
    const r = res.rows[0];
    const nearest = nearestRes.rows[0];
    return {
      slug: region.slug,
      name: region.name,
      kind: region.kind,
      counts: { h24: r.h24, d7: r.d7, d30: r.d30 },
      maxMagnitude: r.max_m === null ? null : round2(num(r.max_m)),
      avgMagnitude: r.avg_m === null ? null : round2(num(r.avg_m)),
      avgDepthKm: r.avg_d === null ? null : round2(num(r.avg_d)),
      lastEventAt: isoOrNull(r.last_event),
      nearestEvent: nearest
        ? {
            id: nearest.id,
            distanceKm: round2(num(nearest.d)),
            magnitude: num(nearest.magnitude),
            occurredAt: iso(nearest.occurred_at),
          }
        : null,
    };
  }

  async allDistrictStats(opts: StoreQueryOptions): Promise<RegionStats[]> {
    const regions = await this.listRegions();
    const out: RegionStats[] = [];
    for (const r of regions) {
      if (r.kind !== 'district') continue;
      const s = await this.regionStats(r.slug, opts);
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.counts.d30 - a.counts.d30);
  }

  // ─────────────────────────────────────────────────────────
  // search
  // ─────────────────────────────────────────────────────────

  async search(query: string, limit: number, opts: StoreQueryOptions): Promise<SearchResult> {
    const q = query.trim();
    if (!q) return { earthquakes: [], faults: [], regions: [] };
    const eq = await this.queryEarthquakes({ search: q, limit }, opts);
    const like = `%${q}%`;
    const faultsRes = await this.pool.query(
      `SELECT id, slug, name, segment_type FROM fault_segments WHERE name ILIKE $1 OR slug ILIKE $1 LIMIT ${limit}`,
      [like],
    );
    const regionsRes = await this.pool.query(
      `SELECT slug, name, kind FROM regions WHERE name ILIKE $1 OR slug ILIKE $1 LIMIT ${limit}`,
      [like],
    );
    return {
      earthquakes: eq.items,
      faults: faultsRes.rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, segmentType: r.segment_type ?? '' })),
      regions: regionsRes.rows.map((r) => ({ slug: r.slug, name: r.name, kind: r.kind })),
    };
  }

  // ─────────────────────────────────────────────────────────
  // data sources / runs / activity / system events
  // ─────────────────────────────────────────────────────────

  async listSources(): Promise<DataSourceStatus[]> {
    const res = await this.pool.query('SELECT * FROM data_sources ORDER BY id');
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: Boolean(r.enabled),
      status: r.status,
      lastSuccessAt: isoOrNull(r.last_success_at),
      lastErrorAt: isoOrNull(r.last_error_at),
      lastError: r.last_error ?? null,
      latencyMs: numOrNull(r.latency_ms),
      errorCount: num(r.error_count ?? 0),
      attribution: r.attribution ?? '',
      url: r.url ?? '',
    }));
  }

  async patchSource(
    id: SourceId,
    patch: Partial<Omit<DataSourceStatus, 'id' | 'name' | 'attribution' | 'url'>>,
  ): Promise<DataSourceStatus | null> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let i = 2;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${i}`);
      params.push(val);
      i += 1;
    };
    if (patch.enabled !== undefined) add('enabled', patch.enabled);
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.lastSuccessAt !== undefined) add('last_success_at', patch.lastSuccessAt);
    if (patch.lastErrorAt !== undefined) add('last_error_at', patch.lastErrorAt);
    if (patch.lastError !== undefined) add('last_error', patch.lastError);
    if (patch.latencyMs !== undefined) add('latency_ms', patch.latencyMs);
    if (patch.errorCount !== undefined) add('error_count', patch.errorCount);
    const res = await this.pool.query(`UPDATE data_sources SET ${sets.join(', ')} WHERE id = $1`, params);
    if ((res.rowCount ?? 0) === 0) return null;
    const list = await this.listSources();
    return list.find((s) => s.id === id) ?? null;
  }

  async startRun(source: SourceId): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO ingestion_runs (source) VALUES ($1) RETURNING id`,
      [source],
    );
    return res.rows[0].id;
  }

  async finishRun(
    id: string,
    patch: Partial<Pick<IngestionRun, 'status' | 'fetched' | 'inserted' | 'updated' | 'merged' | 'invalid' | 'error'>>,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ingestion_runs SET
         finished_at = NOW(),
         status = COALESCE($2, status),
         fetched = COALESCE($3, fetched),
         inserted = COALESCE($4, inserted),
         updated = COALESCE($5, updated),
         merged = COALESCE($6, merged),
         invalid = COALESCE($7, invalid),
         error = $8
       WHERE id = $1`,
      [
        id,
        patch.status ?? null,
        patch.fetched ?? null,
        patch.inserted ?? null,
        patch.updated ?? null,
        patch.merged ?? null,
        patch.invalid ?? null,
        patch.error ?? null,
      ],
    );
  }

  async listRuns(limit: number): Promise<IngestionRun[]> {
    const res = await this.pool.query(
      `SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT ${Math.min(limit, 500)}`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: iso(r.started_at),
      finishedAt: isoOrNull(r.finished_at),
      status: r.status,
      fetched: num(r.fetched),
      inserted: num(r.inserted),
      updated: num(r.updated),
      merged: num(r.merged),
      invalid: num(r.invalid),
      error: r.error ?? null,
    }));
  }

  async saveActivity(snapshot: ActivitySnapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO activity_metrics (region_slug, computed_at, score, level, components, window_hours, sample_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        snapshot.region,
        snapshot.computedAt,
        snapshot.score,
        snapshot.level,
        JSON.stringify(snapshot.components),
        snapshot.windowHours,
        snapshot.sampleSize,
      ],
    );
  }

  async latestActivity(region?: string): Promise<ActivitySnapshot[]> {
    const res = await this.pool.query(
      `SELECT DISTINCT ON (region_slug) region_slug, computed_at, score, level, components, window_hours, sample_size
       FROM activity_metrics
       ${region ? 'WHERE region_slug = $1' : ''}
       ORDER BY region_slug, computed_at DESC`,
      region ? [region] : [],
    );
    return res.rows.map((r) => ({
      region: r.region_slug,
      score: num(r.score),
      level: r.level,
      components: r.components,
      computedAt: iso(r.computed_at),
      windowHours: num(r.window_hours),
      sampleSize: num(r.sample_size),
      disclaimer: ACTIVITY_DISCLAIMER,
    }));
  }

  async activityTimeline(region: string, from: string, to: string): Promise<Array<{ t: string; score: number }>> {
    const res = await this.pool.query(
      `SELECT computed_at, score FROM activity_metrics
       WHERE region_slug = $1 AND computed_at BETWEEN $2 AND $3
       ORDER BY computed_at ASC LIMIT 5000`,
      [region, from, to],
    );
    return res.rows.map((r) => ({ t: iso(r.computed_at), score: num(r.score) }));
  }

  async logEvent(evt: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    service: string;
    event: string;
    message: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO system_events (level, service, event, message, context) VALUES ($1, $2, $3, $4, $5)`,
      [evt.level, evt.service, evt.event, evt.message, evt.context ? JSON.stringify(evt.context) : null],
    );
  }

  async listEvents(opts: { level?: string; limit: number }) {
    const res = await this.pool.query(
      `SELECT id, at, level, service, event, message, context FROM system_events
       ${opts.level ? 'WHERE level = $1' : ''}
       ORDER BY at DESC LIMIT ${Math.min(opts.limit, 500)}`,
      opts.level ? [opts.level] : [],
    );
    return res.rows.map((r) => ({
      id: r.id,
      at: iso(r.at),
      level: r.level,
      service: r.service,
      event: r.event,
      message: r.message,
      context: r.context ?? undefined,
    }));
  }
}
