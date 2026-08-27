'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type {
  ActivitySnapshot,
  DashboardStats,
  DataSourceStatus,
  DistributionBin,
  DistributionKind,
  Earthquake,
  FaultSegment,
  FaultStats,
  IngestionRun,
  Paginated,
  Region,
  RegionStats,
  ScatterPoint,
  SearchResult,
  SystemStatus,
  TimeRange,
  TimelineBucket,
} from '@ils/types';
import { api, qs } from './api';

export interface ListFilters {
  range?: TimeRange;
  from?: string;
  to?: string;
  minMagnitude?: number;
  maxMagnitude?: number;
  minDepth?: number;
  maxDepth?: number;
  source?: string;
  region?: string;
  faultId?: string;
  search?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

export function useStats(region?: string) {
  return useQuery({
    queryKey: ['stats', region ?? 'all'],
    queryFn: () => api<DashboardStats>(`/api/earthquakes/stats${qs({ region })}`),
    refetchInterval: 30_000,
  });
}

export function useLatest(limit = 30) {
  return useQuery({
    queryKey: ['latest', limit],
    queryFn: () => api<Earthquake[]>(`/api/earthquakes/latest${qs({ limit })}`),
    refetchInterval: 60_000,
  });
}

export function useEarthquakes(filters: ListFilters) {
  return useQuery({
    queryKey: ['earthquakes', filters],
    queryFn: () => api<Paginated<Earthquake>>(`/api/earthquakes${qs(filters as Record<string, string | number | undefined>)}`),
    placeholderData: keepPreviousData,
  });
}

export function useEarthquake(id: string | undefined) {
  return useQuery({
    queryKey: ['earthquake', id],
    queryFn: () => api<Earthquake>(`/api/earthquakes/${id}`),
    enabled: Boolean(id),
  });
}

export function useNearby(id: string | undefined, radiusKm = 30) {
  return useQuery({
    queryKey: ['nearby', id, radiusKm],
    queryFn: () => api<Earthquake[]>(`/api/earthquakes/${id}/nearby${qs({ radiusKm })}`),
    enabled: Boolean(id),
  });
}

export function useTimeline(range: TimeRange, region?: string, minMagnitude?: number) {
  return useQuery({
    queryKey: ['timeline', range, region ?? 'all', minMagnitude ?? 0],
    queryFn: () => api<TimelineBucket[]>(`/api/earthquakes/timeline${qs({ range, region, minMagnitude })}`),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useDistribution(kind: DistributionKind, range: TimeRange, region?: string) {
  return useQuery({
    queryKey: ['distribution', kind, range, region ?? 'all'],
    queryFn: () => api<DistributionBin[]>(`/api/earthquakes/distribution${qs({ kind, range, region })}`),
    placeholderData: keepPreviousData,
  });
}

export function useScatter(range: TimeRange, region?: string) {
  return useQuery({
    queryKey: ['scatter', range, region ?? 'all'],
    queryFn: () => api<ScatterPoint[]>(`/api/earthquakes/scatter${qs({ range, region })}`),
    placeholderData: keepPreviousData,
  });
}

export function useFaults() {
  return useQuery({
    queryKey: ['faults'],
    queryFn: () => api<FaultSegment[]>('/api/faults'),
    staleTime: 5 * 60_000,
  });
}

export function useFaultStats() {
  return useQuery({
    queryKey: ['faultStats'],
    queryFn: () => api<FaultStats[]>('/api/faults/stats'),
    refetchInterval: 60_000,
  });
}

export function useFaultDetail(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['fault', idOrSlug],
    queryFn: () => api<FaultStats>(`/api/faults/${idOrSlug}/stats`),
    enabled: Boolean(idOrSlug),
  });
}

export function useFaultEarthquakes(idOrSlug: string | undefined, range: TimeRange = '7d') {
  return useQuery({
    queryKey: ['faultEq', idOrSlug, range],
    queryFn: () => api<Paginated<Earthquake>>(`/api/faults/${idOrSlug}/earthquakes${qs({ range, limit: 50 })}`),
    enabled: Boolean(idOrSlug),
  });
}

export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: () => api<Region[]>('/api/regions'),
    staleTime: 10 * 60_000,
  });
}

export function useRegionStats(slug: string | undefined) {
  return useQuery({
    queryKey: ['regionStats', slug],
    queryFn: () => api<RegionStats>(`/api/regions/${slug}/stats`),
    enabled: Boolean(slug),
  });
}

export function useDistrictStats() {
  return useQuery({
    queryKey: ['districtStats'],
    queryFn: () => api<RegionStats[]>('/api/regions/districts/stats'),
    refetchInterval: 120_000,
  });
}

export function useActivity(region?: 'all' | 'istanbul' | 'marmara') {
  return useQuery({
    queryKey: ['activity', region ?? 'every'],
    queryFn: () => api<ActivitySnapshot[]>(`/api/activity${qs({ region })}`),
    refetchInterval: 30_000,
  });
}

export function useActivityTimeline(region: string, range: TimeRange) {
  return useQuery({
    queryKey: ['activityTimeline', region, range],
    queryFn: () => api<Array<{ t: string; score: number }>>(`/api/activity/timeline${qs({ region, range })}`),
    refetchInterval: 60_000,
  });
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => api<DataSourceStatus[]>('/api/sources/status'),
    refetchInterval: 30_000,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['systemStatus'],
    queryFn: () => api<SystemStatus>('/api/system/status'),
    refetchInterval: 30_000,
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => api<SearchResult>(`/api/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
}

export type { IngestionRun };
