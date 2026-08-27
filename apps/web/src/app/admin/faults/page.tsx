'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FaultSegment } from '@ils/types';
import { Card, CardHeader, Skeleton } from '@ils/ui';
import { adminMutation, api, ApiError } from '@/lib/api';

export default function AdminFaultsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['adminFaults'],
    queryFn: () => api<FaultSegment[]>('/api/admin/faults'),
  });

  const [form, setForm] = useState({
    slug: '',
    name: '',
    segmentType: '',
    description: '',
    source: '',
    sourceUrl: '',
    license: '',
    geometryText: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['adminFaults'] });
    void queryClient.invalidateQueries({ queryKey: ['faults'] });
    void queryClient.invalidateQueries({ queryKey: ['faultStats'] });
  };

  const upsert = useMutation({
    mutationFn: (payload: Record<string, unknown>) => adminMutation('/api/admin/faults', 'POST', payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminMutation(`/api/admin/faults/${id}`, 'DELETE'),
    onSuccess: invalidate,
  });

  const submit = () => {
    setFormError(null);
    let geometry: unknown;
    try {
      geometry = JSON.parse(form.geometryText);
    } catch {
      setFormError('Geometri geçerli JSON değil. GeoJSON LineString/MultiLineString bekleniyor.');
      return;
    }
    if (!form.source.trim()) {
      setFormError('Kaynak (source) zorunludur — kaynağı olmayan fay geometrisi kaydedilemez.');
      return;
    }
    upsert.mutate({
      slug: form.slug.trim(),
      name: form.name.trim(),
      segmentType: form.segmentType.trim(),
      description: form.description.trim(),
      geometry,
      approximate: true,
      source: form.source.trim(),
      sourceUrl: form.sourceUrl.trim(),
      license: form.license.trim(),
      lastVerified: null,
    });
  };

  const inputCls =
    'mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-xs text-txt focus:border-accent/60 focus:outline-none';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Fay Segmentleri" subtitle="Silme işlemi geri alınamaz; ilişkili depremlerin ataması yeniden hesaplanır." />
        {isLoading || !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {data.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-txt">
                    {f.name}
                    {f.isZone && <span className="ml-2 text-[10px] text-txt-mute">ZON</span>}
                    {f.approximate && <span className="ml-2 text-[10px] text-status-warn">yaklaşık</span>}
                  </p>
                  <p className="truncate text-[10px] text-txt-mute">
                    {f.slug} · {f.segmentType} · kaynak: {f.source.slice(0, 60)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`${f.name} silinsin mi? Bu işlem geri alınamaz.`)) remove.mutate(f.id);
                  }}
                  className="rounded-md border border-status-bad/50 px-2 py-1 text-[10px] font-bold text-status-bad hover:bg-status-bad/10"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="GeoJSON İçe Aktar / Güncelle"
          subtitle="Aynı slug'a yazmak günceller. Kaynak metadatası zorunludur — veriyi uydurma."
        />
        <div className="space-y-2 p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">
              Slug
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="ornek-segmenti" className={inputCls} />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">
              Ad
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örnek Segmenti" className={inputCls} />
            </label>
          </div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-txt-mute">
            Segment tipi
            <input value={form.segmentType} onChange={(e) => setForm({ ...form, segmentType: e.target.value })} placeholder="doğrultu atımlı (sağ yanal)" className={inputCls} />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-txt-mute">
            Açıklama
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-txt-mute">
            Kaynak (zorunlu)
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="MTA Yenilenmiş Diri Fay Haritası, 1:250.000 …" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">
              Kaynak URL
              <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} className={inputCls} />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-txt-mute">
              Lisans
              <input value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} className={inputCls} />
            </label>
          </div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-txt-mute">
            GeoJSON geometri (LineString / MultiLineString, [lon, lat])
            <textarea
              value={form.geometryText}
              onChange={(e) => setForm({ ...form, geometryText: e.target.value })}
              rows={6}
              placeholder='{"type":"LineString","coordinates":[[28.4,40.85],[28.7,40.86]]}'
              className={`${inputCls} font-mono`}
            />
          </label>
          {(formError || upsert.isError) && (
            <p className="text-xs text-status-bad">
              {formError ?? (upsert.error instanceof ApiError ? upsert.error.message : 'Kaydetme başarısız.')}
            </p>
          )}
          {upsert.isSuccess && !formError && <p className="text-xs text-status-good">Kaydedildi.</p>}
          <button
            onClick={submit}
            disabled={upsert.isPending}
            className="rounded-md border border-accent/60 bg-accent-soft px-4 py-2 text-xs font-bold text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {upsert.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </Card>
    </div>
  );
}
