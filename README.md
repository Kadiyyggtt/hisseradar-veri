# HisseRadar veri

HisseRadar uygulamasının tarama motoru. GitHub Actions hafta içi günde dört kez çalışır, BIST ve ABD hisselerini
stratejilere göre tarar ve sonucu `docs/tarama/sonuc.json` olarak yayınlar (GitHub Pages).

- `npm run tara:test` sentetik sınama (her tarayıcı için uymalı/uymamalı örnek)
- `SINIR=5 npm run tara` küçük gerçek tarama

Veri kaynağı Yahoo Finance (15 dakika gecikmeli), yedek Stooq. Bu bir yatırım tavsiyesi değildir; eğitim amaçlı tarama sonucudur.
