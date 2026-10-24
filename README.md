# HisseRadar veri

HisseRadar uygulamasının tarama motoru. GitHub Actions hafta içi günde dört kez çalışır, BIST ve ABD hisselerini
stratejilere göre tarar ve sonucu `docs/tarama/` altına yazar (GitHub Pages yayınlar). Uygulama yalnız bu dosyaları okur.

| Dosya | İçerik |
|---|---|
| `sonuc.json` | Bütün eşleşmeler, endeks nabzı, hayali portföy |
| `yeni.json` | Bir önceki koşuya göre yeni eşleşmeler (bildirim bunlardan gider) |
| `grafik.json` | Sembol başına son 60 günlük mum (açılış, yüksek, düşük, kapanış, hacim), şirket adı, sektör, RSI/MACD/EMA |
| `sicil.json` | Formasyon karnesi: ileriye dönük "hedefe ulaştı mı" kayıtları |
| `hedef.json` | Bu koşuda ilk hedefe ulaşan kayıtlar (takip bildirimi `hedef-BIST-THYAO` konusuna) |
| `gecmis.json` | Gün başına endeks kapanışı (XU100, S&P 500) ve hayali portföy değerleri; uygulamadaki karşılaştırma grafiği |
| `ozet.json` | Sayaçlar |

- `npm run tara:test` sentetik sınama (her tarayıcı için uymalı/uymamalı örnek; sicil, bildirim metni, evren, göstergeler)
- `SINIR=5 npm run tara` küçük gerçek tarama (portföy, sicil ve hedef dosyası yazılmaz)
- `node tarama/arac/evren-guncelle.mjs` taranan evreni yeniler (çeyrekte bir): BIST'te günlük ciro ≥ 30 M₺ ya da piyasa değeri ≥ 10 Mr₺ olan paylar + sabit ABD listesi; ad ve sektörle birlikte `tarama/src/veri/evren.ts` dosyasını yazar

Veri kaynağı Yahoo Finance (15 dakika gecikmeli), yedek Stooq. Bu bir yatırım tavsiyesi değildir; eğitim amaçlı tarama sonucudur.
