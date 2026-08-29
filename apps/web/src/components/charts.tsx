'use client';

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Legend,
} from 'recharts';
import type { DistributionBin, ScatterPoint, TimeRange, TimelineBucket } from '@ils/types';
import { Card, CardHeader, EmptyState, SERIES, Skeleton } from '@ils/ui';
import { fmtShort, fmtTime } from '@/lib/format';

/* Tema değişkenli palet — iki yüzey için de dataviz doğrulamasından geçti */
const C1 = SERIES[0]; // counts
const C2 = SERIES[1]; // magnitude overlay
const GRID = 'rgb(var(--txt-soft) / 0.14)';
const AXIS = { fill: 'rgb(var(--txt-mute))', fontSize: 10 } as const;
const AXIS_LINE = { stroke: 'rgb(var(--txt-soft) / 0.28)' } as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
function DarkTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-ink-700/95 px-3 py-2 text-xs shadow-float backdrop-blur-sm">
      {label !== undefined && (
        <p className="mb-1 font-semibold text-txt">{labelFormatter ? labelFormatter(label) : String(label)}</p>
      )}
      {payload.map((entry: any) => (
        <p key={entry.dataKey ?? entry.name} className="flex items-center gap-1.5 text-txt-soft">
          <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color ?? C1 }} />
          {entry.name}: <span className="font-semibold tabular-nums text-txt">{formatVal(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function formatVal(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v ?? '—');
}

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  height = 260,
  loading = false,
  empty = false,
  emptyMessage = 'Bu aralıkta veri yok.',
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} right={right} />
      <div className="p-3" style={{ height }}>
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : empty ? (
          <EmptyState title={emptyMessage} className="h-full" />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/** Timeline: count bars + max-magnitude line overlay (2 series → legend shown). */
export function TimelineChart({
  data,
  range,
  showMax = true,
  height = 240,
}: {
  data: TimelineBucket[];
  range: TimeRange;
  showMax?: boolean;
  height?: number;
}) {
  const short = range === '1h' || range === '6h' || range === '24h';
  const fmt = (t: string) => (short ? fmtTime(t).slice(0, 5) : fmtShort(t).slice(0, 5));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barCategoryGap="18%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmt} tick={AXIS} axisLine={AXIS_LINE} tickLine={false} minTickGap={28} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        {showMax && (
          <YAxis yAxisId="mag" hide domain={[0, 6]} />
        )}
        <Tooltip content={<DarkTooltip labelFormatter={(l: string) => fmtShort(l)} />} cursor={{ fill: 'rgb(var(--txt-soft) / 0.08)' }} />
        {showMax && <Legend wrapperStyle={{ fontSize: 10, color: 'rgb(var(--txt-soft))' }} iconSize={8} />}
        <Bar dataKey="count" name="Deprem sayısı" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={26} />
        {showMax && (
          <Line
            yAxisId="mag"
            dataKey="maxMagnitude"
            name="Maks. büyüklük"
            stroke={C2}
            strokeWidth={2}
            dot={false}
            connectNulls
            type="monotone"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Generic distribution bars (magnitude/depth/hour/day/fault/district). */
export function DistBarChart({
  data,
  layout = 'vertical',
  height = 240,
  color = C1,
}: {
  data: DistributionBin[];
  layout?: 'vertical' | 'horizontal';
  height?: number;
  color?: string;
}) {
  if (layout === 'horizontal') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis type="category" dataKey="label" width={110} tick={{ ...AXIS, fill: 'rgb(var(--txt-soft))' }} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgb(var(--txt-soft) / 0.08)' }} />
          <Bar dataKey="count" name="Deprem sayısı" fill={color} radius={[0, 4, 4, 0]} maxBarSize={16}>
            {data.map((d) => (
              <Cell key={d.key} fill={color} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={AXIS_LINE} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgb(var(--txt-soft) / 0.08)' }} />
        <Bar dataKey="count" name="Deprem sayısı" fill={color} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Magnitude vs depth scatter — single hue, dot size = magnitude. */
export function MagDepthScatter({ data, height = 260 }: { data: ScatterPoint[]; height?: number }) {
  const points = data.map((p) => ({ ...p, size: 20 + p.magnitude * 22 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          dataKey="magnitude"
          name="Büyüklük"
          type="number"
          domain={[0, 'auto']}
          tick={AXIS}
          axisLine={AXIS_LINE}
          tickLine={false}
          label={{ value: 'Büyüklük (M)', position: 'insideBottom', offset: -2, fill: 'rgb(var(--txt-mute))', fontSize: 10 }}
        />
        <YAxis
          dataKey="depthKm"
          name="Derinlik"
          type="number"
          reversed
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          label={{ value: 'Derinlik (km)', angle: -90, position: 'insideLeft', fill: 'rgb(var(--txt-mute))', fontSize: 10 }}
        />
        <ZAxis dataKey="size" range={[16, 160]} />
        <Tooltip content={<DarkTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'rgb(var(--txt-soft) / 0.3)' }} />
        <Scatter data={points} fill={C1} fillOpacity={0.65} stroke="rgb(var(--ink-800))" strokeWidth={1} name="Deprem" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Time vs magnitude scatter. */
export function TimeMagScatter({ data, height = 260 }: { data: ScatterPoint[]; height?: number }) {
  const points = data.map((p) => ({ ...p, ts: Date.parse(p.t), size: 16 + p.magnitude * 20 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v: number) => fmtShort(new Date(v).toISOString())}
          tick={AXIS}
          axisLine={AXIS_LINE}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis dataKey="magnitude" type="number" domain={[0, 'auto']} tick={AXIS} axisLine={false} tickLine={false} />
        <ZAxis dataKey="size" range={[14, 130]} />
        <Tooltip
          content={
            <DarkTooltip
              labelFormatter={(v: number) => fmtShort(new Date(v).toISOString())}
            />
          }
          cursor={{ strokeDasharray: '3 3', stroke: 'rgb(var(--txt-soft) / 0.3)' }}
        />
        <Scatter data={points} fill={C1} fillOpacity={0.65} stroke="rgb(var(--ink-800))" strokeWidth={1} name="Büyüklük" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Activity index over time (single series line). */
export function ActivityTimelineChart({
  data,
  height = 200,
}: {
  data: Array<{ t: string; score: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={(t: string) => fmtTime(t).slice(0, 5)} tick={AXIS} axisLine={AXIS_LINE} tickLine={false} minTickGap={36} />
        <YAxis domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip content={<DarkTooltip labelFormatter={(l: string) => fmtShort(l)} />} />
        <Line dataKey="score" name="Aktivite indeksi" stroke={SERIES[2]} strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
