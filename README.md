# İSTANBUL LIVE SEISMIC

**İstanbul'un canlı sismik hareketlerini izleyin.** · *Live Istanbul Earthquake Intelligence*

İstanbul ve Marmara çevresindeki güncel deprem hareketlerini gerçek zamanlı izleyen, harita üzerinde gösteren,
fay segmentlerini görselleştiren, geçmiş verileri analiz eden ve canlı veri akışını WebSocket üzerinden
kullanıcıya aktaran, uçtan uca çalışan bir sismik veri platformu.

> ⚠️ **Bu platform resmî bir deprem ölçüm kurumu değildir ve deprem tahmini yapmaz.**
> Veriler AFAD ve Kandilli Rasathanesi'nin (KOERI) yayınladığı bilgilerden alınır. "Aktivite indeksi" dahil hiçbir
> gösterge geleceğe dönük öngörü değildir; yalnızca gözlenen verinin istatistiksel yoğunluğunu özetler.
> Resmî bilgi için: [deprem.afad.gov.tr](https://deprem.afad.gov.tr) · [koeri.boun.edu.tr](http://www.koeri.boun.edu.tr)

---

## Özellikler

- **Canlı veri hattı** — AFAD (apiv2 JSON) + Kandilli (lst0 metin listesi) provider adapter'ları; 20 sn'de bir
  nazik polling; `fetch → parse → validate → normalize → dedupe → db → spatial → cache → broadcast` pipeline'ı
- **Duplicate engine** — aynı fiziksel olay iki kaynaktan farklı kimlikle geldiğinde zaman/mesafe/büyüklük
  eşikleriyle tek olay altında birleşir; **her iki kaynak da saklanır** (`sources: [AFAD, KANDILLI]`)
- **PostgreSQL + PostGIS** — `GEOGRAPHY` kolonlar, GIST/zaman/büyüklük indeksleri; en yakın fay, İstanbul
  mesafesi, poligon içi sınıflandırma `ST_Distance / ST_DWithin / ST_Intersects` ile SQL'de
- **Bağımlılıksız geliştirme modu** — `DATABASE_URL` yoksa aynı semantiklere sahip in-memory store +
  gömülü ingestion + etiketli sentetik geçmişle **tek komutta** çalışır
- **WebSocket + polling fallback** — `/ws` üzerinden `earthquake:new/updated`, `sources:status`,
  `activity:update`; bağlantı koparsa 30 sn polling'e düşer, dönünce polling durur
- **GIS** — MapLibre GL; büyüklük = marker boyutu, renk = son gözlem zamanı (doğrulanmış sıralı rampa);
  fay katmanı, İstanbul sınırı, ilçe katmanı, opsiyonel ısı haritası; tıklanınca detay panelleri
- **Analitik** — backend agregasyonlu zaman serileri (boş kovalar dahil), büyüklük/derinlik/saat/gün/fay/ilçe
  dağılımları, scatter'lar, gözlemsel aktivite indeksi (+zorunlu sorumluluk reddi)
- **Admin paneli** — bcrypt + JWT (httpOnly cookie) oturum; kaynak aç/kapat, manuel ingestion, kaynak
  metadatası zorunlu GeoJSON fay içe aktarımı, yapılandırılmış sistem log görüntüleyici
- **Şeffaflık** — her kayıtta kaynak rozeti; sentetik (seed/mock) veriler her yerde **DEVELOPMENT DATA**
  olarak etiketlenir ve `NODE_ENV=production`'da hiç üretilmez/gösterilmez

## Mimari

```
apps/
  web/        Next.js 14 (dark dashboard, MapLibre, TanStack Query, Zustand, Recharts)
  api/        Fastify 5 (REST + /ws WebSocket hub + Swagger /api/docs + admin auth)
  worker/     Ingestion engine + provider adapter'ları (standalone veya API içinde gömülü)
packages/
  types/      Paylaşılan domain modelleri & WS protokolü
  config/     Merkezî env doğrulama (zod), sabitler, timezone yardımcıları (UTC ↔ Europe/Istanbul)
  gis/        Haversine/polyline mesafeleri, bölge poligonları, fay GeoJSON seed'leri, aktivite indeksi
  database/   SQL migration'lar, PgStore (PostGIS) + MemoryStore, Redis/memory cache + event bus, seed
```

```
AFAD ─┐                                          ┌─ REST /api/* ── Next.js (same-origin proxy)
KOERI ─┼─ worker: validate → dedupe → PostGIS ───┼─ WS /ws ─────── tarayıcı (fallback: 30 sn polling)
MOCK ──┘        │                    │           └─ Swagger /api/docs
 (yalnız dev)   └─ ingestion_runs    └─ Redis cache + pub/sub bus
```

Dağıtım modları:

| Mod | Ne zaman | Nasıl |
|---|---|---|
| **Memory (dev)** | `DATABASE_URL` boş | Ingestion API içinde gömülü çalışır; in-memory store + cache + bus |
| **Tek süreç + Postgres** | küçük kurulum | `DATABASE_URL` + `EMBEDDED_INGESTION=true` |
| **Tam ayrık (üretim)** | docker-compose | api + worker ayrı; Redis pub/sub olayları ve komutları taşır |

## Hızlı Başlangıç (bağımlılıksız)

```bash
npm install
npm run dev        # api :4000 (gömülü ingestion + mock) + web :3000
```

Tarayıcı: <http://localhost:3000> · API dokümanları: <http://localhost:4000/api/docs>
Geliştirme modunda 30 günlük **etiketli** sentetik geçmiş otomatik yüklenir; AFAD'a erişim varsa gerçek
veriler de aynı anda akar. Admin: `admin / admin` (yalnız dev fallback — env ile değiştirin).

## PostgreSQL + Redis ile

```bash
cp .env.example .env            # DATABASE_URL, REDIS_URL vb. doldurun
npm run db:migrate              # şema + PostGIS
npm run db:seed                 # fay/bölge/kaynak kayıtları (+ dev'de etiketli sentetik geçmiş)
npm run dev:full                # api + standalone worker + web
```

## Docker

```bash
echo "ADMIN_JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build    # postgres(postgis) + redis + api + worker + web
```

API konteyneri açılışta migration + registry seed uygular. Üretimde sentetik veri asla yazılmaz.

## Komutlar

```bash
npm run dev          # memory modunda api + web
npm run dev:full     # api + worker + web (Postgres gerektirir)
npm run build        # tüm workspace'lerin üretim derlemesi
npm run start        # derlenmiş api + web
npm run test         # vitest unit + entegrasyon (63 test)
npm run test:e2e     # Playwright smoke (sunucuları kendisi başlatır / çalışanı kullanır)
npm run lint         # eslint (backend) + next lint (web)
npm run typecheck    # tüm workspace'lerde tsc --noEmit (strict)
npm run db:migrate   # SQL migration'ları uygula
npm run db:seed      # fay/bölge/kaynak seed (+ dev'de sentetik geçmiş; --force, --no-history)
```

## Ücretsiz Yayın (Render.com)

Repo kökündeki [`render.yaml`](./render.yaml) blueprint'i iki ücretsiz servis kurar: API (+gömülü veri
toplama) ve Next.js arayüz. Veritabanı gerekmez (bellek modu).

1. [render.com](https://render.com) hesabı aç → **New → Blueprint** → bu GitHub repo'sunu seç → **Apply**.
   Apply sırasında sorulan `ADMIN_PASSWORD` için kendine bir admin şifresi belirle; diğer boş alanları
   şimdilik geç.
2. İki servis kurulunca adreslerini kopyala (örn. `https://tarih-mimarlik-api.onrender.com` ve
   `https://tarih-mimarlik-web.onrender.com`).
3. **web** servisinin Environment ayarına şunları yaz (kaydedince kendini yeniden kurar):
   - `API_PROXY_TARGET` = API adresi (`https://…-api.onrender.com`)
   - `NEXT_PUBLIC_WS_URL` = `wss://…-api.onrender.com/ws`
4. **api** servisinin Environment ayarına: `WEB_ORIGIN` = web adresi (`https://…-web.onrender.com`).
5. Web adresini aç — panel yayında.

Notlar: Free planda 15 dk ziyaret olmazsa servisler uyur; ilk ziyaretçi ~1 dk bekler. Uyanınca AFAD'dan
son 6 saat otomatik geri çekilir. `NEXT_PUBLIC_WS_URL` ayarlanana kadar canlı akış 30 sn'lik polling ile
çalışır (adım 3 sonrası gerçek zamanlı olur). Kalıcı veritabanı ve 7/24 çalışma istersen `docker-compose`
yığınını ücretsiz bir Oracle Cloud "Always Free" sunucusuna kurabilirsin.

## Portları Değiştirme

Portlar kök dizindeki `.env` dosyasından okunur — tek yerden, kalıcı:

```bash
# .env (repo kökünde)
WEB_PORT=5000    # site  → http://localhost:5000
API_PORT=4000    # API   → proxy ve WebSocket adresleri bundan otomatik türetilir
```

Dosyayı bir kez oluşturman yeterli; `npm run dev` / `npm run start` her açılışta uygular. Gerçek ortam
değişkenleri `.env` dosyasını ezer.

## Ortam Değişkenleri

Tam liste ve açıklamalar: [`.env.example`](./.env.example). Öne çıkanlar:

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | Boş → in-memory dev modu; dolu → PostgreSQL + PostGIS |
| `REDIS_URL` | Boş → in-memory cache/bus; dolu → Redis cache, rate-limit ve api↔worker pub/sub |
| `EMBEDDED_INGESTION` | Ingestion'ı API sürecinde çalıştır (memory modunda zorunlu ve otomatik) |
| `INGESTION_INTERVAL_MS` | Upstream polling aralığı (≥ 15000; kaynakları spamlemeyin) |
| `DEDUPE_TIME_SECONDS/_DISTANCE_KM/_MAGNITUDE_DELTA` | Duplicate eşleştirme eşikleri (90 sn / 15 km / 0.7) |
| `ADMIN_PASSWORD_HASH` | bcrypt hash (üret: `npm run -w @ils/api hash-password -- 'şifre'`) — plaintext saklamayın |
| `NEXT_PUBLIC_WS_URL` | Tarayıcının WS adresi (REST, Next'in same-origin proxy'sinden geçer) |
| `NEXT_PUBLIC_MAPTILER_KEY` | Opsiyonel MapTiler koyu vektör stili; yoksa ücretsiz Carto koyu raster |

## Veri Kaynakları, Kullanım ve Atıf

- **AFAD** — T.C. İçişleri Bakanlığı AFAD deprem olay servisi (`deprem.afad.gov.tr/apiv2`). Sorgular Marmara
  bbox'ı ve son 6 saatlik pencereyle sınırlı tutulur; varsayılan 20 sn aralık upstream'e saygılıdır.
- **KANDİLLİ (KOERI)** — Boğaziçi Üniversitesi Kandilli Rasathanesi ve DAE RETMC "son depremler" listesi
  (`lst0.asp`, windows-1254, TSİ). Çözümler *İlksel* olabilir; REVIZE satırları aynı olaya birleşir.
- Kaynak bilgisi kullanıcıdan asla gizlenmez: tabloda, detayda ve CSV'de kaynak rozetleri/kolonları vardır.
- Bir kaynak çökerse durum `DEGRADED/OFFLINE` olarak işaretlenir, diğer kaynaklar çalışmaya devam eder ve
  arayüz son başarılı verinin yaşını gösterir.

### Veri bütünlüğü (uydurma veri yok)

- **Fay geometrileri** yayımlanmış Marmara segment haritalarından *kaba, yaklaşık* sayısallaştırmadır;
  `source`, `source_url`, `license`, `last_verified` ve `approximate=true` metadatasıyla saklanır ve arayüzde
  "yaklaşık geometri" olarak etiketlenir. Yetkili veri: MTA Yenilenmiş Diri Fay Haritası, AFAD TDVMS.
  Admin panelinden kaynak metadatası zorunlu tutularak resmî GeoJSON içe aktarılabilir.
- **İstanbul/Marmara poligonları ve 39 ilçe merkezi** de yaklaşıktır (resmî sınır değildir); ilçe ataması
  merkez-yarıçap yöntemiyle yapılır ve arayüzde böyle açıklanır. Resmî sınırlar: İBB Açık Veri Portalı.
- **Sentetik veri** yalnızca geliştirme içindir: `dataClass = seed|mock`, kaynak `MOCK`, arayüzde
  **DEVELOPMENT DATA** rozeti. Üretimde mock provider başlatılamaz (constructor guard), seed sentetik veri
  yazmayı reddeder ve public API sentetik kayıtları döndürmez.

## API

Swagger UI: `GET /api/docs`. Başlıca uçlar:

```
GET /api/earthquakes            # filtreler: range|from|to, minMagnitude, minDepth/maxDepth,
                                #   source, region, faultId, search, order, limit, offset
GET /api/earthquakes/latest     # ?since= ile polling fallback
GET /api/earthquakes/stats      # KPI bloğu (1s/24s/7g sayıları, maks M, ort. derinlik, en yakın)
GET /api/earthquakes/timeline   # backend agregasyonu; boş kovalar dahil
GET /api/earthquakes/distribution?kind=magnitude|depth|fault|district|hour|day
GET /api/earthquakes/scatter    # magnitude–derinlik / zaman–magnitude
GET /api/earthquakes/export     # CSV (Europe/Istanbul, BOM'lu, filtreleri uygular)
GET /api/earthquakes/:id        # + /:id/nearby
GET /api/faults · /api/faults/stats · /api/faults/:id · /:id/stats · /:id/earthquakes
GET /api/regions · /api/regions/:slug/stats · /api/regions/districts/stats
GET /api/activity · /api/activity/timeline        # her yanıtta zorunlu disclaimer
GET /api/search?q= · /api/system/status · /api/sources/status · /health
POST/GET /api/admin/* (oturum + mutasyonlarda x-ils-admin CSRF başlığı)
```

### WebSocket (`/ws`)

Sunucu → istemci olayları: `hello`, `heartbeat` (25 sn), `earthquake:new`, `earthquake:updated`,
`sources:status`, `activity:update`. Örnek:

```json
{ "type": "earthquake:new", "data": { "id": "…", "magnitude": 2.4, "depthKm": 7.2,
  "latitude": 40.8, "longitude": 29.1, "location": "Adalar Açıkları", "source": "AFAD", "sources": [ … ] } }
```

## Güvenlik

Helmet güvenlik başlıkları · CORS allow-list (`WEB_ORIGIN`) · IP başına rate limit (Redis destekli;
login ve export için daha sıkı) · tüm sorgu/gövde girdileri JSON-Schema ile doğrulanır · yalnızca
parametreli SQL · bcrypt(12) parola, JWT httpOnly `SameSite=Lax` cookie, mutasyonlarda özel başlık
CSRF koruması · admin uçları kimliksiz erişime kapalı · WS üretimde origin kontrolü.

## Performans

Sıcak uçlar Redis/memory cache'ten döner (latest 10 s, stats 15 s, agregasyonlar 30–60 s) ve worker veri
değişince önbelleği düşürür · spatial sorgular GIST indeksli · zaman serileri backend'de kovalanır (frontend
ham binlerce olayı işlemez) · liste uçları sayfalıdır (limit ≤ 500) · harita/grafik bileşenleri memoize
GeoJSON üretir · `earthquakes` tablosu ileride `occurred_at` üzerinden aylık partitioning'e geçirilebilecek
şekilde tasarlanmıştır (TimescaleDB de takılabilir).

## Test

- **Unit** — AFAD/Kandilli parser'ları (fixture'larla), normalizasyon, duplicate detector, mesafe
  hesapları, aktivite skoru, MemoryStore spatial sorguları
- **Entegrasyon** — Fastify `inject` ile tüm REST yüzeyi (auth/CSRF dahil); engine → store → broadcast
- **E2E** — Playwright: ana sayfa, filtre↔URL senkronu, detay sayfası, harita (veya zarif fallback),
  live mod, API durumu ve **canlı olayın WS/polling ile arayüze akışı**

```bash
npm run test && npm run test:e2e
```

## Ekran Görüntüsü Aracı

```bash
OUT_DIR=/tmp TARGETS='[["/","home",4000]]' node scripts/screenshot.mjs
```
