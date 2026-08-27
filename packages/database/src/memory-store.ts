import { randomUUID } from 'node:crypto';
import { FAULT_ASSOCIATION_KM, ISTANBUL_CENTER, SOURCE_META } from '@ils/config';
import {
  FAULT_SEEDS,
  REGION_SEEDS,
  classifyDistrict,
  haversineKm,
  nearestFault,
  pointInPolygon,
} from '@ils/gis';
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
  RegionStats,
  ScatterPoint,
  SearchResult,
  SourceId,
  TimelineBucket,
} from '@ils/types';
import { rangeToMs } from '@ils/types';
import { bucketStart, computeDistribution, fillTimeline, pickCanonical, round2, type DistRow } from './shared';
import type {
  CandidateQuery,
  DataStore,
  FaultUpsert,
  MergeResult,
  StoreQueryOptions,
  TimelineQuery,
} from './store';

interface SystemEventRow {
  id: string;
  at: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  service: string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}

const MAX_EVENTS = 100_000;
const MAX_SYSTEM_EVENTS = 2_000;
const MAX_RUNS = 1_000;
const MAX_ACTIVITY = 20_000;

/**
 * In-process DataStore used when DATABASE_URL is not configured (development,
 * tests). Implements the same semantics as the PostGIS store with plain
 * geometry math from @ils/gis.
 */
export class MemoryStore implements DataStore {
  readonly mode = 'memory' as const;

  private events = new Map<string, Earthquake>();
  private sourceIndex = new Map<string, string>();
  private faults: FaultSegment[] = [];
  private regions: Region[] = [];
  private sources = new Map<SourceId, DataSourceStatus>();
  private runs: IngestionRun[] = [];
  private activities: ActivitySnapshot[] = [];
  private sysEvents: SystemEventRow[] = [];

  async init(): Promise<void> {
    const now = new Date().toISOString();
    if (this.faults.length === 0) {
      this.faults = FAULT_SEEDS.map((f) => ({
        id: randomUUID(),
        name: f.name,
        slug: f.slug,
        geometry: f.geometry,
        segmentType: f.segmentType,
        description: f.description,
        approximate: f.approximate,
        isZone: f.isZone,
        source: f.source,
        sourceUrl: f.sourceUrl,
        license: f.license,
        lastVerified: f.lastVerified,
        createdAt: now,
        updatedAt: now,
      }));
    }
    if (this.regions.length === 0) {
      this.regions = REGION_SEEDS.map((r) => ({
        id: randomUUID(),
        slug: r.slug,
        name: r.name,
        kind: r.kind,
        geometry: r.geometry,
        centroid: r.centroid,
        radiusKm: r.radiusKm,
        approximate: r.approximate,
        source: r.source,
      }));
    }
    for (const id of ['AFAD', 'KANDILLI', 'MOCK'] as SourceId[]) {
      if (!this.sources.has(id)) {
        const meta = SOURCE_META[id];
        this.sources.set(id, {
          id,
          name: meta.name,
          enabled: true,
          status: 'UNKNOWN',
          lastSuccessAt: null,
          lastErrorAt: null,
          lastError: null,
          latencyMs: null,
          errorCount: 0,
          attribution: meta.attribution,
          url: meta.url,
        });
      }
    }
  }

  async close(): Promise<void> {
    /* nothing to release */
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number | null }> {
    return { ok: true, latencyMs: 0 };
  }

  // ─────────────────────────────────────────────────────────
  // enrichment
  // ─────────────────────────────────────────────────────────

  private enrich(lat: number, lon: number) {
    const istanbulDistanceKm = round2(
      haversineKm(lat, lon, ISTANBUL_CENTER.latitude, ISTANBUL_CENTER.longitude),
    );
    const nf = nearestFault(lat, lon, this.faults);
    const district = classifyDistrict(lat, lon, haversineKm);
    const ist = this.regions.find((r) => r.slug === 'istanbul');
    const sea = this.regions.find((r) => r.slug === 'marmara');
    return {
      istanbulDistanceKm,
      nearestFaultId: nf ? nf.fault.id : null,
      nearestFaultSlug: nf ? nf.fault.slug : null,
      nearestFaultName: nf ? nf.fault.name : null,
      nearestFaultDistanceKm: nf ? round2(nf.distanceKm) : null,
      districtSlug: district?.slug ?? null,
      districtName: district?.name ?? null,
      inIstanbul: ist?.geometry ? pointInPolygon(lat, lon, ist.geometry) : false,
      inMarmaraSea: sea?.geometry ? pointInPolygon(lat, lon, sea.geometry) : false,
    };
  }

  private toSourceRecord(report: EarthquakeReport, firstSeenAt: string, lastSeenAt: string): EarthquakeSourceRecord {
    return {
      source: report.source,
      sourceEventId: report.sourceEventId ?? report.id,
      occurredAt: report.occurredAt,
      latitude: report.latitude,
      longitude: report.longitude,
      depthKm: report.depthKm,
      magnitude: report.magnitude,
      magnitudeType: report.magnitudeType,
      location: report.location,
      firstSeenAt,
      lastSeenAt,
    };
  }

  private applyCanonical(event: Earthquake): void {
    const canonical = pickCanonical(event.sources);
    event.occurredAt = canonical.occurredAt;
    event.latitude = canonical.latitude;
    event.longitude = canonical.longitude;
    event.depthKm = canonical.depthKm;
    event.magnitude = canonical.magnitude;
    event.magnitudeType = canonical.magnitudeType;
    event.location = canonical.location;
    event.source = canonical.source;
    Object.assign(event, this.enrich(event.latitude, event.longitude));
  }

  // ─────────────────────────────────────────────────────────
  // ingestion primitives
  // ─────────────────────────────────────────────────────────

  async getBySourceEvent(source: SourceId, sourceEventId: string): Promise<Earthquake | null> {
    const id = this.sourceIndex.get(`${source}:${sourceEventId}`);
    return id ? this.events.get(id) ?? null : null;
  }

  async getCandidates(q: CandidateQuery): Promise<Earthquake[]> {
    const t = Date.parse(q.occurredAt);
    const tolMs = q.toleranceSeconds * 1000;
    const out: Earthquake[] = [];
    for (const e of this.events.values()) {
      if (Math.abs(Date.parse(e.occurredAt) - t) > tolMs) continue;
      if (haversineKm(q.latitude, q.longitude, e.latitude, e.longitude) > q.radiusKm) continue;
      out.push(e);
    }
    return out;
  }

  async insertEvent(report: EarthquakeReport): Promise<Earthquake> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const sourceRecord = this.toSourceRecord(report, now, now);
    const event: Earthquake = {
      id,
      occurredAt: report.occurredAt,
      latitude: report.latitude,
      longitude: report.longitude,
      depthKm: report.depthKm,
      magnitude: report.magnitude,
      magnitudeType: report.magnitudeType,
      location: report.location,
      source: report.source,
      dataClass: report.dataClass ?? 'live',
      sources: [sourceRecord],
      ...this.enrich(report.latitude, report.longitude),
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(id, event);
    this.sourceIndex.set(`${sourceRecord.source}:${sourceRecord.sourceEventId}`, id);
    this.trimEvents();
    return event;
  }

  async mergeReport(eventId: string, report: EarthquakeReport): Promise<MergeResult> {
    const event = this.events.get(eventId);
    if (!event) throw new Error(`mergeReport: unknown event ${eventId}`);
    const now = new Date().toISOString();
    const key = `${report.source}:${report.sourceEventId ?? report.id}`;
    const existing = event.sources.find(
      (s) => s.source === report.source && s.sourceEventId === (report.sourceEventId ?? report.id),
    );
    const before = JSON.stringify([event.magnitude, event.depthKm, event.occurredAt, event.latitude, event.longitude, event.location, event.source]);
    if (existing) {
      existing.occurredAt = report.occurredAt;
      existing.latitude = report.latitude;
      existing.longitude = report.longitude;
      existing.depthKm = report.depthKm;
      existing.magnitude = report.magnitude;
      existing.magnitudeType = report.magnitudeType;
      existing.location = report.location;
      existing.lastSeenAt = now;
    } else {
      event.sources.push(this.toSourceRecord(report, now, now));
      this.sourceIndex.set(key, eventId);
    }
    if ((report.dataClass ?? 'live') === 'live') event.dataClass = 'live';
    this.applyCanonical(event);
    const changed = before !== JSON.stringify([event.magnitude, event.depthKm, event.occurredAt, event.latitude, event.longitude, event.location, event.source]);
    if (changed || !existing) event.updatedAt = now;
    return { event, changed };
  }

  private trimEvents(): void {
    if (this.events.size <= MAX_EVENTS) return;
    const sorted = [...this.events.values()].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
    for (const victim of sorted.slice(0, this.events.size - MAX_EVENTS)) {
      this.events.delete(victim.id);
      for (const s of victim.sources) this.sourceIndex.delete(`${s.source}:${s.sourceEventId}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // filtering helpers
  // ─────────────────────────────────────────────────────────

  private matchesRegion(e: Earthquake, slug: string | undefined): boolean {
    if (!slug || slug === 'all') return true;
    if (slug === 'istanbul') return e.inIstanbul;
    if (slug === 'marmara') return e.inMarmaraSea;
    const region = this.regions.find((r) => r.slug === slug);
    if (!region) return false;
    if (region.kind === 'district') return e.districtSlug === slug;
    if (region.geometry) return pointInPolygon(e.latitude, e.longitude, region.geometry);
    if (region.radiusKm !== null) {
      return (
        haversineKm(e.latitude, e.longitude, region.centroid.latitude, region.centroid.longitude) <=
        region.radiusKm
      );
    }
    return false;
  }

  private filtered(q: EarthquakeQuery, opts: StoreQueryOptions): Earthquake[] {
    const fromMs = q.from ? Date.parse(q.from) : q.range ? Date.now() - rangeToMs(q.range) : -Infinity;
    const toMs = q.to ? Date.parse(q.to) : Infinity;
    const search = q.search?.trim().toLocaleLowerCase('tr-TR');
    const out: Earthquake[] = [];
    for (const e of this.events.values()) {
      if (!opts.includeSynthetic && e.dataClass !== 'live') continue;
      const ts = Date.parse(e.occurredAt);
      if (ts < fromMs || ts > toMs) continue;
      if (q.minMagnitude !== undefined && e.magnitude < q.minMagnitude) continue;
      if (q.maxMagnitude !== undefined && e.magnitude > q.maxMagnitude) continue;
      if (q.minDepth !== undefined && e.depthKm < q.minDepth) continue;
      if (q.maxDepth !== undefined && e.depthKm >= q.maxDepth) continue;
      if (q.source && q.source !== 'ALL' && !e.sources.some((s) => s.source === q.source)) continue;
      if (q.faultId && e.nearestFaultId !== q.faultId && e.nearestFaultSlug !== q.faultId) continue;
      if (!this.matchesRegion(e, q.region)) continue;
      if (search) {
        const hay = `${e.location} ${e.id} ${e.districtName ?? ''} ${e.nearestFaultName ?? ''}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(search)) continue;
      }
      out.push(e);
    }
    const order = q.order ?? 'time_desc';
    out.sort((a, b) => {
      if (order === 'magnitude_desc') return b.magnitude - a.magnitude;
      const d = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
      return order === 'time_asc' ? d : -d;
    });
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // querying
  // ─────────────────────────────────────────────────────────

  async getEarthquake(id: string): Promise<Earthquake | null> {
    return this.events.get(id) ?? null;
  }

  async queryEarthquakes(q: EarthquakeQuery, opts: StoreQueryOptions): Promise<Paginated<Earthquake>> {
    const all = this.filtered(q, opts);
    const limit = Math.min(q.limit ?? 50, 500);
    const offset = q.offset ?? 0;
    return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
  }

  async latestEarthquakes(limit: number, sinceIso: string | undefined, opts: StoreQueryOptions): Promise<Earthquake[]> {
    const q: EarthquakeQuery = sinceIso ? { from: sinceIso } : {};
    return this.filtered(q, opts).slice(0, limit);
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
    return this.filtered({ from }, opts)
      .filter((e) => e.id !== excludeId)
      .filter((e) => haversineKm(lat, lon, e.latitude, e.longitude) <= radiusKm)
      .slice(0, 200);
  }

  async dashboardStats(region: string | undefined, opts: StoreQueryOptions): Promise<DashboardStats> {
    const now = Date.now();
    const d30 = this.filtered({ from: new Date(now - 30 * 86_400_000).toISOString(), region }, opts);
    const inWindow = (ms: number) => d30.filter((e) => now - Date.parse(e.occurredAt) <= ms);
    const h24 = inWindow(86_400_000);
    const maxEvent = h24.reduce<Earthquake | null>(
      (best, e) => (best === null || e.magnitude > best.magnitude ? e : best),
      null,
    );
    const nearest = h24.reduce<Earthquake | null>(
      (best, e) => (best === null || e.istanbulDistanceKm < best.istanbulDistanceKm ? e : best),
      null,
    );
    const lastEvent = d30.length > 0 ? d30[0]! : null;
    return {
      counts: {
        h1: inWindow(3_600_000).length,
        h24: h24.length,
        d7: inWindow(7 * 86_400_000).length,
        d30: d30.length,
      },
      maxMagnitude24h: maxEvent ? { value: maxEvent.magnitude, event: maxEvent } : null,
      avgDepthKm24h: h24.length ? round2(h24.reduce((s, e) => s + e.depthKm, 0) / h24.length) : null,
      nearestToIstanbul24h: nearest ? { distanceKm: nearest.istanbulDistanceKm, event: nearest } : null,
      lastEventAt: lastEvent?.occurredAt ?? null,
      generatedAt: new Date(now).toISOString(),
    };
  }

  async timeline(q: TimelineQuery): Promise<TimelineBucket[]> {
    const events = this.filtered(
      { from: q.from, to: q.to, region: q.region, minMagnitude: q.minMagnitude },
      { includeSynthetic: q.includeSynthetic },
    );
    const sparse = new Map<number, { count: number; maxMagnitude: number | null; sumMagnitude: number; sumDepth: number }>();
    for (const e of events) {
      const key = bucketStart(Date.parse(e.occurredAt), q.bucketMs);
      const b = sparse.get(key) ?? { count: 0, maxMagnitude: null, sumMagnitude: 0, sumDepth: 0 };
      b.count += 1;
      b.maxMagnitude = b.maxMagnitude === null ? e.magnitude : Math.max(b.maxMagnitude, e.magnitude);
      b.sumMagnitude += e.magnitude;
      b.sumDepth += e.depthKm;
      sparse.set(key, b);
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
    const rows: DistRow[] = this.filtered({ from, to, region }, opts).map((e) => ({
      occurredAt: e.occurredAt,
      magnitude: e.magnitude,
      depthKm: e.depthKm,
      faultSlug: e.nearestFaultSlug,
      faultName: e.nearestFaultName,
      faultDistanceKm: e.nearestFaultDistanceKm,
      districtSlug: e.districtSlug,
      districtName: e.districtName,
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
    return this.filtered({ from, to, region }, opts)
      .slice(0, limit)
      .map((e) => ({ id: e.id, t: e.occurredAt, magnitude: e.magnitude, depthKm: e.depthKm }));
  }

  async eventsForActivity(region: string | undefined, opts: StoreQueryOptions) {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    return this.filtered({ from, region }, opts).map((e) => ({
      occurredAt: e.occurredAt,
      magnitude: e.magnitude,
      depthKm: e.depthKm,
      latitude: e.latitude,
      longitude: e.longitude,
    }));
  }

  // ─────────────────────────────────────────────────────────
  // faults
  // ─────────────────────────────────────────────────────────

  async listFaults(): Promise<FaultSegment[]> {
    return [...this.faults];
  }

  async getFault(idOrSlug: string): Promise<FaultSegment | null> {
    return this.faults.find((f) => f.id === idOrSlug || f.slug === idOrSlug) ?? null;
  }

  async upsertFault(input: FaultUpsert): Promise<FaultSegment> {
    const now = new Date().toISOString();
    const existing = this.faults.find((f) => (input.id && f.id === input.id) || f.slug === input.slug);
    if (existing) {
      Object.assign(existing, {
        name: input.name,
        slug: input.slug,
        geometry: input.geometry,
        segmentType: input.segmentType,
        description: input.description,
        approximate: input.approximate,
        isZone: input.isZone,
        source: input.source,
        sourceUrl: input.sourceUrl,
        license: input.license,
        lastVerified: input.lastVerified,
        updatedAt: now,
      });
      this.reenrichAll();
      return existing;
    }
    const fault: FaultSegment = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      geometry: input.geometry,
      segmentType: input.segmentType,
      description: input.description,
      approximate: input.approximate,
      isZone: input.isZone,
      source: input.source,
      sourceUrl: input.sourceUrl,
      license: input.license,
      lastVerified: input.lastVerified,
      createdAt: now,
      updatedAt: now,
    };
    this.faults.push(fault);
    this.reenrichAll();
    return fault;
  }

  async deleteFault(id: string): Promise<boolean> {
    const idx = this.faults.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    this.faults.splice(idx, 1);
    this.reenrichAll();
    return true;
  }

  private reenrichAll(): void {
    for (const e of this.events.values()) {
      Object.assign(e, this.enrich(e.latitude, e.longitude));
    }
  }

  async faultStats(faultId: string, opts: StoreQueryOptions): Promise<FaultStats | null> {
    const fault = await this.getFault(faultId);
    if (!fault) return null;
    const now = Date.now();
    const associated = this.filtered(
      { from: new Date(0).toISOString() },
      opts,
    ).filter(
      (e) =>
        e.nearestFaultId === fault.id &&
        e.nearestFaultDistanceKm !== null &&
        e.nearestFaultDistanceKm <= FAULT_ASSOCIATION_KM,
    );
    const win = (ms: number) => associated.filter((e) => now - Date.parse(e.occurredAt) <= ms);
    const d30 = win(30 * 86_400_000);
    const closest = associated.reduce<Earthquake | null>((best, e) => {
      if (e.nearestFaultDistanceKm === null) return best;
      if (!best || e.nearestFaultDistanceKm < (best.nearestFaultDistanceKm ?? Infinity)) return e;
      return best;
    }, null);
    return {
      faultId: fault.id,
      slug: fault.slug,
      name: fault.name,
      counts: { h24: win(86_400_000).length, d7: win(7 * 86_400_000).length, d30: d30.length, total: associated.length },
      maxMagnitude: d30.length ? round2(Math.max(...d30.map((e) => e.magnitude))) : null,
      avgMagnitude: d30.length ? round2(d30.reduce((s, e) => s + e.magnitude, 0) / d30.length) : null,
      avgDepthKm: d30.length ? round2(d30.reduce((s, e) => s + e.depthKm, 0) / d30.length) : null,
      lastEventAt: associated[0]?.occurredAt ?? null,
      closestEvent: closest
        ? {
            id: closest.id,
            distanceKm: closest.nearestFaultDistanceKm ?? 0,
            magnitude: closest.magnitude,
            occurredAt: closest.occurredAt,
          }
        : null,
    };
  }

  async allFaultStats(opts: StoreQueryOptions): Promise<FaultStats[]> {
    const out: FaultStats[] = [];
    for (const f of this.faults) {
      if (f.isZone) continue;
      const s = await this.faultStats(f.id, opts);
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.counts.d30 - a.counts.d30);
  }

  // ─────────────────────────────────────────────────────────
  // regions
  // ─────────────────────────────────────────────────────────

  async listRegions(): Promise<Region[]> {
    return [...this.regions];
  }

  async getRegion(slug: string): Promise<Region | null> {
    return this.regions.find((r) => r.slug === slug) ?? null;
  }

  async regionStats(slug: string, opts: StoreQueryOptions): Promise<RegionStats | null> {
    const region = await this.getRegion(slug);
    if (!region) return null;
    const now = Date.now();
    const d30 = this.filtered({ from: new Date(now - 30 * 86_400_000).toISOString(), region: slug }, opts);
    const win = (ms: number) => d30.filter((e) => now - Date.parse(e.occurredAt) <= ms);
    const withDistance = d30
      .map((e) => ({
        e,
        d: haversineKm(e.latitude, e.longitude, region.centroid.latitude, region.centroid.longitude),
      }))
      .sort((a, b) => a.d - b.d);
    const nearest = withDistance[0];
    return {
      slug: region.slug,
      name: region.name,
      kind: region.kind,
      counts: { h24: win(86_400_000).length, d7: win(7 * 86_400_000).length, d30: d30.length },
      maxMagnitude: d30.length ? round2(Math.max(...d30.map((e) => e.magnitude))) : null,
      avgMagnitude: d30.length ? round2(d30.reduce((s, e) => s + e.magnitude, 0) / d30.length) : null,
      avgDepthKm: d30.length ? round2(d30.reduce((s, e) => s + e.depthKm, 0) / d30.length) : null,
      lastEventAt: d30[0]?.occurredAt ?? null,
      nearestEvent: nearest
        ? {
            id: nearest.e.id,
            distanceKm: round2(nearest.d),
            magnitude: nearest.e.magnitude,
            occurredAt: nearest.e.occurredAt,
          }
        : null,
    };
  }

  async allDistrictStats(opts: StoreQueryOptions): Promise<RegionStats[]> {
    const out: RegionStats[] = [];
    for (const r of this.regions) {
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
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return { earthquakes: [], faults: [], regions: [] };
    const earthquakes = this.filtered({ search: query }, opts).slice(0, limit);
    const faults = this.faults
      .filter((f) => `${f.name} ${f.slug}`.toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, limit)
      .map((f) => ({ id: f.id, slug: f.slug, name: f.name, segmentType: f.segmentType }));
    const regions = this.regions
      .filter((r) => `${r.name} ${r.slug}`.toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, limit)
      .map((r) => ({ slug: r.slug, name: r.name, kind: r.kind }));
    return { earthquakes, faults, regions };
  }

  // ─────────────────────────────────────────────────────────
  // data sources / runs / activity / system events
  // ─────────────────────────────────────────────────────────

  async listSources(): Promise<DataSourceStatus[]> {
    return [...this.sources.values()];
  }

  async patchSource(
    id: SourceId,
    patch: Partial<Omit<DataSourceStatus, 'id' | 'name' | 'attribution' | 'url'>>,
  ): Promise<DataSourceStatus | null> {
    const s = this.sources.get(id);
    if (!s) return null;
    Object.assign(s, patch);
    return s;
  }

  async startRun(source: SourceId): Promise<string> {
    const run: IngestionRun = {
      id: randomUUID(),
      source,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'RUNNING',
      fetched: 0,
      inserted: 0,
      updated: 0,
      merged: 0,
      invalid: 0,
      error: null,
    };
    this.runs.unshift(run);
    if (this.runs.length > MAX_RUNS) this.runs.length = MAX_RUNS;
    return run.id;
  }

  async finishRun(
    id: string,
    patch: Partial<Pick<IngestionRun, 'status' | 'fetched' | 'inserted' | 'updated' | 'merged' | 'invalid' | 'error'>>,
  ): Promise<void> {
    const run = this.runs.find((r) => r.id === id);
    if (!run) return;
    Object.assign(run, patch);
    run.finishedAt = new Date().toISOString();
  }

  async listRuns(limit: number): Promise<IngestionRun[]> {
    return this.runs.slice(0, limit);
  }

  async saveActivity(snapshot: ActivitySnapshot): Promise<void> {
    this.activities.unshift(snapshot);
    if (this.activities.length > MAX_ACTIVITY) this.activities.length = MAX_ACTIVITY;
  }

  async latestActivity(region?: string): Promise<ActivitySnapshot[]> {
    const regions = region ? [region] : [...new Set(this.activities.map((a) => a.region))];
    const out: ActivitySnapshot[] = [];
    for (const r of regions) {
      const latest = this.activities.find((a) => a.region === r);
      if (latest) out.push(latest);
    }
    return out;
  }

  async activityTimeline(region: string, from: string, to: string): Promise<Array<{ t: string; score: number }>> {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    return this.activities
      .filter((a) => a.region === region)
      .filter((a) => {
        const t = Date.parse(a.computedAt);
        return t >= fromMs && t <= toMs;
      })
      .map((a) => ({ t: a.computedAt, score: a.score }))
      .reverse();
  }

  async logEvent(evt: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    service: string;
    event: string;
    message: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    this.sysEvents.unshift({ id: randomUUID(), at: new Date().toISOString(), ...evt });
    if (this.sysEvents.length > MAX_SYSTEM_EVENTS) this.sysEvents.length = MAX_SYSTEM_EVENTS;
  }

  async listEvents(opts: { level?: string; limit: number }) {
    return this.sysEvents
      .filter((e) => !opts.level || e.level === opts.level)
      .slice(0, opts.limit);
  }
}
