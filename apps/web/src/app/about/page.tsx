import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hakkında',
  description:
    'İstanbul Live Seismic platformunun veri kaynakları, yöntemleri, sınırları ve sorumluluk reddi.',
};

const sectionCls = 'rounded-lg border border-line bg-ink-800/80 p-5';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">HAKKINDA</h1>

      <section className={sectionCls}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Bu platform nedir?</h2>
        <p className="text-sm leading-relaxed text-txt-soft">
          İSTANBUL LIVE SEISMIC, İstanbul ve Marmara çevresindeki güncel deprem hareketlerini gerçek zamanlı izleyen,
          harita üzerinde gösteren, fay segmentlerini görselleştiren ve geçmiş verileri analiz eden açık bir izleme
          panelidir.
        </p>
      </section>

      <section className={`${sectionCls} border-status-warn/40`}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-status-warn">Önemli uyarılar</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-txt-soft">
          <li>
            <strong className="text-txt">Bu platform resmî bir deprem ölçüm kurumu değildir.</strong> Veriler ilgili
            veri sağlayıcılarının (AFAD ve Kandilli Rasathanesi) yayınladığı bilgilerden alınmaktadır ve sağlayıcılar
            tarafından revize edilebilir.
          </li>
          <li>
            <strong className="text-txt">Platform deprem tahmini yapmaz.</strong> &quot;Aktivite indeksi&quot; dahil hiçbir
            gösterge gelecekte deprem olup olmayacağına dair bir öngörü değildir; yalnızca gözlenen geçmiş ve mevcut
            verinin istatistiksel yoğunluğunu özetler.
          </li>
          <li>
            Acil durumlarda ve resmî bilgi için{' '}
            <a href="https://deprem.afad.gov.tr" className="text-accent hover:underline" rel="noreferrer" target="_blank">
              AFAD
            </a>{' '}
            ve{' '}
            <a href="http://www.koeri.boun.edu.tr" className="text-accent hover:underline" rel="noreferrer" target="_blank">
              Kandilli Rasathanesi (KOERI)
            </a>{' '}
            kaynaklarını esas alın.
          </li>
        </ul>
      </section>

      <section className={sectionCls}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Veri kaynakları ve atıf</h2>
        <ul className="space-y-2 text-sm leading-relaxed text-txt-soft">
          <li>
            <strong className="text-txt">AFAD</strong> — T.C. İçişleri Bakanlığı Afet ve Acil Durum Yönetimi
            Başkanlığı deprem olay servisi. Her kayıtta kaynak rozeti gösterilir.
          </li>
          <li>
            <strong className="text-txt">KANDİLLİ</strong> — Boğaziçi Üniversitesi Kandilli Rasathanesi ve DAE
            Bölgesel Deprem-Tsunami İzleme Merkezi son depremler listesi. Çözümler &quot;İlksel&quot; olabilir ve revize
            edilebilir.
          </li>
          <li>
            Aynı fiziksel olay iki kaynaktan farklı kimliklerle gelebilir; sistem zaman/mesafe/büyüklük eşiğiyle bu
            kayıtları tek olay altında birleştirir ve <em>her iki kaynağı da saklar</em>.
          </li>
        </ul>
      </section>

      <section className={sectionCls}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Fay geometrileri ve bölgeler</h2>
        <p className="text-sm leading-relaxed text-txt-soft">
          Haritadaki fay segmentleri (Tekirdağ, Orta Marmara, Kumburgaz, Adalar, Çınarcık) yayımlanmış segment
          haritalarından <strong className="text-txt">kaba çözünürlükte, yaklaşık olarak</strong> sayısallaştırılmıştır
          ve yalnızca görselleştirme ile &quot;en yakın segment&quot; raporlaması içindir; bilimsel kullanım için uygun
          değildir. Yetkili ve güncel fay verisi için MTA Yenilenmiş Diri Fay Haritası ve AFAD TDVMS kullanılmalıdır.
          İstanbul/Marmara poligonları ile ilçe merkezleri de aynı şekilde yaklaşıktır; resmî sınır verisi İBB Açık
          Veri Portalı&apos;ndan yönetim paneli aracılığıyla içe aktarılabilir.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Yöntem notları</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-txt-soft">
          <li>Zaman damgaları UTC olarak saklanır, arayüzde Europe/Istanbul (TSİ) gösterilir.</li>
          <li>İstanbul mesafesi ve fay mesafeleri PostGIS coğrafi fonksiyonlarıyla (bellek modunda eşdeğer küresel geometriyle) hesaplanır.</li>
          <li>Bir deprem, en yakın segmenti 10 km içindeyse o segmentle &quot;ilişkilendirilmiş&quot; sayılır — bu bir raporlama uzlaşımıdır, sismolojik atıf değildir.</li>
          <li>Isı haritası ve kümelenme görselleri gözlenen frekansı gösterir; &quot;istatistiksel kümelenme&quot;dir, bilimsel ölçüm olarak sunulmaz.</li>
          <li>Geliştirme ortamında üretilen sentetik kayıtlar her yerde &quot;DEVELOPMENT DATA&quot; olarak etiketlenir ve üretimde gösterilmez.</li>
        </ul>
      </section>

      <section className={sectionCls}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Açık kaynak</h2>
        <p className="text-sm leading-relaxed text-txt-soft">
          Platform; Next.js, Fastify, PostgreSQL/PostGIS, Redis ve MapLibre GL ile geliştirilmiştir. API dokümantasyonu{' '}
          <a href="/api/docs" className="text-accent hover:underline" target="_blank">
            /api/docs
          </a>{' '}
          adresindedir.
        </p>
      </section>
    </div>
  );
}
