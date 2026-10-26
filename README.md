# HisseRadar veri

HisseRadar uygulamasının tarama motoru. GitHub Actions hafta içi günde dört kez çalışır, BIST ve ABD hisselerini
taramalara göre tarar ve sonucu `docs/tarama/` altına yazar (GitHub Pages yayınlar). Uygulama yalnız bu dosyaları okur.

## Zamanlama

- Tarama hafta içi dört kez: BIST açılış sonrası (sabah), gün ortası, kapanış sonrası ve ABD kapanışı sonrası (gece).
  Cron dakikaları :23 ve :53; GitHub zamanlanmış işleri saatlerce geciktirebildiği için saat vaadi yoktur.
- Sabah brifingi hafta içi sabah, günün ilk sabah taramasının sonunda gider (tara → yayınla → bildir → brifing);
  tarama geç koşarsa brifing de onunla birlikte gelir. Haftalık özet pazar akşamı (brifing.yml).
- Sessiz saat: Türkiye saatiyle 22:00-08:00 arası hiçbir bildirim gönderilmez. Gece ABD taramasının yeni
  eşleşmeleri ve hedef bildirimleri `bekleyen.json` kuyruğuna girer, sabahki ilk koşuda gönderilir.
- Firebase gizli değeri (`FCM_SERVIS_HESABI`) yoksa ya da bildirim ertelendiyse durum her koşunun iş özetinde yazar.

| Dosya | İçerik |
|---|---|
| `sonuc.json` | Bütün eşleşmeler, endeks nabzı, otomatik portföy, hatalı semboller (`taranan.hatali`), üretim zamanı (`uretildi`) ve son mumun tarihi (`veriTarihi`, YYYY-MM-DD) |
| `yeni.json` | Bir önceki koşuya göre yeni eşleşmeler (bildirim bunlardan gider); önceki koşuda veri hatası olan hisse "yeni" sayılmaz. `sessiz`, `sabahIlk` alanları bildirim ve brifing içindir |
| `bekleyen.json` | Sessiz saatte birikip sabah gidecek bildirimler (yalnız gece koşusundan sabaha kadar var) |
| `grafik.json` | Sembol başına son 60 günlük mum (açılış, yüksek, düşük, kapanış, hacim), şirket adı, sektör, RSI/MACD/EMA |
| `sicil.json` | Formasyon karnesi: ileriye dönük "hedefe ulaştı mı" kayıtları |
| `hedef.json` | Bu koşuda ilk hedefe ulaşan kayıtlar (takip bildirimi `hedef-BIST-THYAO` konusuna) |
| `gecmis.json` | Gün başına endeks kapanışı (XU100, S&P 500) ve otomatik portföy değerleri; uygulamadaki karşılaştırma grafiği |
| `hisse-sicil.json` | Hisse bazlı geçmiş: son 500 günde her formasyonun o hissede kaç kez oluştuğu ve 30 günde hedefe ulaşıp ulaşmadığı (cumartesi, hisse-sicil.yml) |
| `ozet.json` | Sayaçlar, `uretildi`, `veriTarihi` |

- `npm run tara:test` sentetik sınama (her tarayıcı için uymalı/uymamalı örnek; sicil, bildirim metni, evren, göstergeler)
- `SINIR=5 npm run tara` küçük gerçek tarama (portföy, sicil ve hedef dosyası yazılmaz)
- `npm run brifing -- sabah|hafta` sabah brifingi / haftalık özet bildirimi (sabah: tarama.yml, günün ilk sabah koşusu; hafta: brifing.yml, pazar akşamı); `KURU=1` yalnız metni yazar
- `npx tsx tarama/src/sina-altyapi.ts` altyapı sınaması: Türkçe adlar, sessiz saat ve kuyruk, hayalet "yeni", veri tarihi, evren aracının sözlüğü koruması
- `npm run hisse-sicil` hisse bazlı geçmişi hesaplar (haftalık iş akışı; `SINIR=5` ile deneme)
- `node tarama/arac/evren-guncelle.mjs` taranan evreni yeniler (çeyrekte bir): BIST'te günlük ciro ≥ 30 M₺ ya da piyasa değeri ≥ 10 Mr₺ olan paylar + sabit ABD listesi; ad ve sektörle birlikte `tarama/src/veri/evren.ts` dosyasını yazar. Türkçe ad sözlüğü (`TURKCE_AD`, dosyadaki korunan blok) elle yazılır ve araç onu ezmez; sözlükte olmayan yeni sembolü listeler

Veri kaynağı Yahoo Finance (15 dakika gecikmeli), yedek Stooq. Bu bir yatırım tavsiyesi değildir; eğitim amaçlı tarama sonucudur.
