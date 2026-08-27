-- İSTANBUL LIVE SEISMIC — initial schema
-- Requires PostgreSQL >= 14 with the PostGIS extension available.
--
-- Data retention note: the schema is designed so `earthquakes` can later be
-- converted to declarative RANGE partitioning by month on `occurred_at`
-- (composite PK (id, occurred_at) + partition-local indexes). Until volumes
-- require it, a plain table with the indexes below is faster to operate.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────
-- fault_segments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fault_segments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    geometry      GEOGRAPHY(GEOMETRY, 4326) NOT NULL,
    segment_type  VARCHAR(80) NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    approximate   BOOLEAN NOT NULL DEFAULT TRUE,
    is_zone       BOOLEAN NOT NULL DEFAULT FALSE,
    source        TEXT NOT NULL DEFAULT '',
    source_url    TEXT NOT NULL DEFAULT '',
    license       TEXT NOT NULL DEFAULT '',
    last_verified DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fault_segments_geometry_idx
    ON fault_segments USING GIST (geometry);

-- ─────────────────────────────────────────────────────────────
-- regions (city / sea polygons, district centroids)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    kind         VARCHAR(20) NOT NULL,
    geometry     GEOGRAPHY(POLYGON, 4326),
    centroid     GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_km    DOUBLE PRECISION,
    approximate  BOOLEAN NOT NULL DEFAULT TRUE,
    source       TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS regions_geometry_idx ON regions USING GIST (geometry);
CREATE INDEX IF NOT EXISTS regions_centroid_idx ON regions USING GIST (centroid);

-- ─────────────────────────────────────────────────────────────
-- earthquakes (canonical, deduplicated events)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earthquakes (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at               TIMESTAMPTZ NOT NULL,
    latitude                  DOUBLE PRECISION NOT NULL,
    longitude                 DOUBLE PRECISION NOT NULL,
    depth_km                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    magnitude                 DOUBLE PRECISION NOT NULL,
    magnitude_type            VARCHAR(20),
    location                  TEXT NOT NULL DEFAULT '',
    source                    VARCHAR(20) NOT NULL,
    data_class                VARCHAR(10) NOT NULL DEFAULT 'live',
    geom                      GEOGRAPHY(POINT, 4326) NOT NULL,
    istanbul_distance_km      DOUBLE PRECISION NOT NULL DEFAULT 0,
    nearest_fault_id          UUID REFERENCES fault_segments(id) ON DELETE SET NULL,
    nearest_fault_distance_km DOUBLE PRECISION,
    district_slug             TEXT,
    in_istanbul               BOOLEAN NOT NULL DEFAULT FALSE,
    in_marmara_sea            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS earthquakes_geom_idx        ON earthquakes USING GIST (geom);
CREATE INDEX IF NOT EXISTS earthquakes_occurred_at_idx ON earthquakes (occurred_at DESC);
CREATE INDEX IF NOT EXISTS earthquakes_magnitude_idx   ON earthquakes (magnitude);
CREATE INDEX IF NOT EXISTS earthquakes_fault_time_idx  ON earthquakes (nearest_fault_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS earthquakes_district_idx    ON earthquakes (district_slug, occurred_at DESC);
CREATE INDEX IF NOT EXISTS earthquakes_data_class_idx  ON earthquakes (data_class);

-- ─────────────────────────────────────────────────────────────
-- earthquake_sources (every provider report kept, per event)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earthquake_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    earthquake_id   UUID NOT NULL REFERENCES earthquakes(id) ON DELETE CASCADE,
    source          VARCHAR(20) NOT NULL,
    source_event_id TEXT NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    depth_km        DOUBLE PRECISION NOT NULL DEFAULT 0,
    magnitude       DOUBLE PRECISION NOT NULL,
    magnitude_type  VARCHAR(20),
    location        TEXT NOT NULL DEFAULT '',
    raw_payload     JSONB,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, source_event_id)
);

CREATE INDEX IF NOT EXISTS earthquake_sources_event_idx ON earthquake_sources (earthquake_id);

-- ─────────────────────────────────────────────────────────────
-- data_sources (provider registry + health)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_sources (
    id              VARCHAR(20) PRIMARY KEY,
    name            TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    last_success_at TIMESTAMPTZ,
    last_error_at   TIMESTAMPTZ,
    last_error      TEXT,
    latency_ms      INTEGER,
    error_count     INTEGER NOT NULL DEFAULT 0,
    attribution     TEXT NOT NULL DEFAULT '',
    url             TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- ingestion_runs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source      VARCHAR(20) NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status      VARCHAR(10) NOT NULL DEFAULT 'RUNNING',
    fetched     INTEGER NOT NULL DEFAULT 0,
    inserted    INTEGER NOT NULL DEFAULT 0,
    updated     INTEGER NOT NULL DEFAULT 0,
    merged      INTEGER NOT NULL DEFAULT 0,
    invalid     INTEGER NOT NULL DEFAULT 0,
    error       TEXT
);

CREATE INDEX IF NOT EXISTS ingestion_runs_started_idx ON ingestion_runs (started_at DESC);

-- ─────────────────────────────────────────────────────────────
-- activity_metrics (observational activity index snapshots)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_metrics (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_slug  TEXT NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    score        DOUBLE PRECISION NOT NULL,
    level        VARCHAR(12) NOT NULL,
    components   JSONB NOT NULL,
    window_hours INTEGER NOT NULL DEFAULT 24,
    sample_size  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS activity_metrics_region_time_idx
    ON activity_metrics (region_slug, computed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- system_events (structured application log)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_events (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level   VARCHAR(8) NOT NULL DEFAULT 'INFO',
    service TEXT NOT NULL DEFAULT '',
    event   TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    context JSONB
);

CREATE INDEX IF NOT EXISTS system_events_at_idx ON system_events (at DESC);
