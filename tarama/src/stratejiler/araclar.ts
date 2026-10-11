import type { Tarayici } from '../tipler';
import { dmi } from '../gostergeler/dmi';
import { fisher } from '../gostergeler/fisher';
import { heikin } from '../gostergeler/heikin';
import { rsi } from '../gostergeler/rsi';
import { pivotlar } from '../gostergeler/pivot';
import { eslesme, f2, kapanislar } from './ortak';

/** 4.1 — Heikin teyit mumu: bugün tek taraflı kuyruk, dün farklı yön ya da kararsız. */
export const heikinTeyit: Tarayici = {
  id: 'heikin',
  tara(s) {
    const h = heikin(s['1d']);
    const i = h.length - 1;
    const bugun = h[i];
    if (!bugun.teyit) return null;
    const dun = h[i - 1];
    if (dun.teyit === bugun.teyit) return null; // zaten devam eden trend, yeni haber değil
    const yon = bugun.teyit === 'yukari' ? 'al' : 'sat';
    return eslesme(s, 'heikin', '1d', yon, 100,
      [`Heikin Ashi'de bugün ${bugun.teyit === 'yukari' ? 'sadece üst kuyruklu yeşil' : 'sadece alt kuyruklu kırmızı'} teyit mumu oluştu.`,
       `Dün ${dun.teyit ? 'ters yönde teyit' : 'kararsız (iki kuyruklu)'} mum vardı: yön ${bugun.teyit === 'yukari' ? 'yukarı' : 'aşağı'} döndü.`]);
  },
};

/** 4.2 — Haftalık Çift Onay: DMI +DI, -DI'yi yukarı kesti ve Fisher tetiği yukarı kesti (son 2 hafta). */
export const haftalikCiftOnay: Tarayici = {
  id: 'haftalik-cift-onay',
  tara(s) {
    const m = s['1w'];
    if (m.length < 40) return null;
    const { artiDI, eksiDI } = dmi(m, 14);
    const { fish, tetik } = fisher(m, 14);
    const i = m.length - 1;
    const dmiAl = (j: number) => artiDI[j - 1] <= eksiDI[j - 1] && artiDI[j] > eksiDI[j];
    const fishAl = (j: number) => fish[j - 1] <= tetik[j - 1] && fish[j] > tetik[j];
    const dmiSon = [i, i - 1].find(dmiAl);
    const fishSon = [i, i - 1].find(fishAl);
    if (dmiSon === undefined || fishSon === undefined) return null;
    return eslesme(s, 'haftalik-cift-onay', '1w', 'al', 100,
      ['Haftalık DMI(14): +DI, -DI\'yi yukarı kesti (öncü).', 'Haftalık Fisher(14) tetiğini yukarı kesti (onay).', 'İstatistik: 1-2 haftada %5; Heikin teyidiyle güçlenir.'],
      { 'Hedef %5': m[i].k * 1.05 });
  },
};

/** 4.3 — RSI uyumsuzluğu: fiyat daha düşük dip, RSI daha yüksek dip (pozitif) ya da tersi. */
export const rsiUyumsuzluk: Tarayici = {
  id: 'rsi-uyumsuzluk',
  tara(s) {
    const m = s['1d'];
    const r = rsi(kapanislar(m), 14);
    const p = pivotlar(m, 4);
    const dipler = p.filter((x) => x.tur === 'dip').slice(-2);
    const tepeler = p.filter((x) => x.tur === 'tepe').slice(-2);
    const i = m.length - 1;
    if (dipler.length === 2 && i - dipler[1].i <= 5) {
      const [a, b] = dipler;
      if (b.fiyat < a.fiyat && r[b.i] > r[a.i] + 2)
        return eslesme(s, 'rsi-uyumsuzluk', '1d', 'al', 100,
          [`Fiyat daha düşük dip yaptı (${f2(a.fiyat)} → ${f2(b.fiyat)}), RSI daha yüksek dip (${r[a.i].toFixed(0).replace('.', ',')} → ${r[b.i].toFixed(0).replace('.', ',')}).`, 'Pozitif uyumsuzluk: satış gücü azalıyor.']);
    }
    if (tepeler.length === 2 && i - tepeler[1].i <= 5) {
      const [a, b] = tepeler;
      if (b.fiyat > a.fiyat && r[b.i] < r[a.i] - 2)
        return eslesme(s, 'rsi-uyumsuzluk', '1d', 'sat', 100,
          [`Fiyat daha yüksek tepe yaptı (${f2(a.fiyat)} → ${f2(b.fiyat)}), RSI daha düşük tepe (${r[a.i].toFixed(0).replace('.', ',')} → ${r[b.i].toFixed(0).replace('.', ',')}).`, 'Negatif uyumsuzluk: alım gücü azalıyor.']);
    }
    return null;
  },
};
