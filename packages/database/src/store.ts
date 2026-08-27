import type {
  ActivitySnapshot,
  DashboardStats,
  DataSourceStatus,
  DistributionBin,
  DistributionKind,
  Earthquake,
  EarthquakeQuery,
  EarthquakeReport,
  FaultSegment,
  FaultStats,
  IngestionRun,
  Paginated,
  Region,
  RegionStats,
  ScatterPoint,
  SearchResult,
  SourceId,
  TimelineBucket,
} from '@ils/types';

export interface CandidateQuery {
  occurredAt: string;
  toleranceSeconds: number;
  latitude: number;
  longitude: number;
  /** Coarse bbox radius used to pre-filter candidates (km). */
  radiusKm: number;
}

export interface TimelineQuery {
  from: string;
  to: string;
  bucketMs: number;
  region?: string;
  minMagnitude?: number;
  includeSynthetic: boolean;
}

export interface FaultUpsert {
  id?: string;
  slug: string;
  name: string;
  segmentType: string;
  description: string;
  geometry: FaultSegment['geometry'];
  approximate: boolean;
  isZone: boolean;
  source: string;
  sourceUrl: string;
  license: string;
  lastVerified: string | null;
}

export interface MergeResult {
  event: Earthquake;
  /** True when canonical fields visibly changed (worth broadcasting an update). */
  changed: boolean;
}

export interface StoreQueryOptions {
  includeSynthetic: boolean;
}

/**
 * DataStore — single persistence abstraction implemented twice:
 *  - PgStore     : PostgreSQL + PostGIS (production path; spatial SQL)
 *  - MemoryStore : in-process fallback for dependency-free development/tests
 */
export interface DataStore {
  readonly mode: 'postgres' | 'memory';

  /** Connect / verify schema, and idempotently seed faults, regions, sources. */
  init(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<{ ok: boolean; latencyMs: number | null }>;

  // ── earthquakes: ingestion primitives ──
  getBySourceEvent(source: SourceId, sourceEventId: string): Promise<Earthquake | null>;
  getCandidates(q: CandidateQuery): Promise<Earthquake[]>;
  insertEvent(report: EarthquakeReport): Promise<Earthquake>;
  /** Attach/refresh a source report on an existing event and recompute canonical fields. */
  mergeReport(eventId: string, report: EarthquakeReport): Promise<MergeResult>;

  // ── earthquakes: querying ──
  getEarthquake(id: string): Promise<Earthquake | null>;
  queryEarthquakes(q: EarthquakeQuery, opts: StoreQueryOptions): Promise<Paginated<Earthquake>>;
  latestEarthquakes(limit: number, sinceIso: string | undefined, opts: StoreQueryOptions): Promise<Earthquake[]>;
  /** Events near a point (for the detail page "nearby events" panel). */
  nearbyEarthquakes(
    lat: number,
    lon: number,
    radiusKm: number,
    days: number,
    excludeId: string | undefined,
    opts: StoreQueryOptions,
  ): Promise<Earthquake[]>;

  // ── aggregations ──
  dashboardStats(region: string | undefined, opts: StoreQueryOptions): Promise<DashboardStats>;
  timeline(q: TimelineQuery): Promise<TimelineBucket[]>;
  distribution(
    kind: DistributionKind,
    from: string,
    to: string,
    region: string | undefined,
    opts: StoreQueryOptions,
  ): Promise<DistributionBin[]>;
  scatter(from: string, to: string, region: string | undefined, limit: number, opts: StoreQueryOptions): Promise<ScatterPoint[]>;
  /** Minimal projection of a region's last-30d events for the activity index. */
  eventsForActivity(region: string | undefined, opts: StoreQueryOptions): Promise<
    Array<{ occurredAt: string; magnitude: number; depthKm: number; latitude: number; longitude: number }>
  >;

  // ── faults ──
  listFaults(): Promise<FaultSegment[]>;
  getFault(idOrSlug: string): Promise<FaultSegment | null>;
  upsertFault(input: FaultUpsert): Promise<FaultSegment>;
  deleteFault(id: string): Promise<boolean>;
  faultStats(faultId: string, opts: StoreQueryOptions): Promise<FaultStats | null>;
  allFaultStats(opts: StoreQueryOptions): Promise<FaultStats[]>;

  // ── regions ──
  listRegions(): Promise<Region[]>;
  getRegion(slug: string): Promise<Region | null>;
  regionStats(slug: string, opts: StoreQueryOptions): Promise<RegionStats | null>;
  allDistrictStats(opts: StoreQueryOptions): Promise<RegionStats[]>;

  // ── search ──
  search(query: string, limit: number, opts: StoreQueryOptions): Promise<SearchResult>;

  // ── data sources ──
  listSources(): Promise<DataSourceStatus[]>;
  patchSource(
    id: SourceId,
    patch: Partial<Omit<DataSourceStatus, 'id' | 'name' | 'attribution' | 'url'>>,
  ): Promise<DataSourceStatus | null>;

  // ── ingestion runs ──
  startRun(source: SourceId): Promise<string>;
  finishRun(
    id: string,
    patch: Partial<Pick<IngestionRun, 'status' | 'fetched' | 'inserted' | 'updated' | 'merged' | 'invalid' | 'error'>>,
  ): Promise<void>;
  listRuns(limit: number): Promise<IngestionRun[]>;

  // ── activity metrics ──
  saveActivity(snapshot: ActivitySnapshot): Promise<void>;
  latestActivity(region?: string): Promise<ActivitySnapshot[]>;
  activityTimeline(region: string, from: string, to: string): Promise<Array<{ t: string; score: number }>>;

  // ── system events ──
  logEvent(evt: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    service: string;
    event: string;
    message: string;
    context?: Record<string, unknown>;
  }): Promise<void>;
  listEvents(opts: { level?: string; limit: number }): Promise<
    Array<{ id: string; at: string; level: string; service: string; event: string; message: string; context?: unknown }>
  >;
}
