import type { Tarayici } from '../tipler';
import { pivotlar, hacimOrt } from '../gostergeler/pivot';
import { eslesme, f2 } from './ortak';

/** 0.3 — Yükselen dipler: son üç pivot dip ardışık yükseliyor (filtre/rozet). */
export const yukselenDipler: Tarayici = {
  id: 'yukselen-dipler',
  tara(s) {
    const p = pivotlar(s['1d'], 4).filter((x) => x.tur === 'dip').slice(-3);
    if (p.length < 3) return null;
    if (!(p[0].fiyat < p[1].fiyat && p[1].fiyat < p[2].fiyat)) return null;
    return eslesme(s, 'yukselen-dipler', '1d', 'izle', 100,
      [`Son üç dip yükseliyor: ${f2(p[0].fiyat)} → ${f2(p[1].fiyat)} → ${f2(p[2].fiyat)}.`, 'Yükseliş öngörüsü için ön şart sağlanıyor.']);
  },
};

/** 2.13 — 26/18 Kuyruklu W. */
export const kuyrukluW: Tarayici = {
  id: 'kuyruklu-w',
  tara(s) {
    const m = s['1d'];
    const i = m.length - 1;
    // Son 60 mumda uzun alt kuyruklu bir dip mumu ara (kuyruk gövdenin 2 katı, dipte).
    for (let j = i - 8; j >= Math.max(20, i - 60); j--) {
      const mum = m[j];
      const govde = Math.abs(mum.k - mum.a);
      const altKuyruk = Math.min(mum.a, mum.k) - mum.d;
      if (altKuyruk < Math.max(govde * 2, mum.k * 0.02)) continue;
      const enDusuk = Math.min(...m.slice(j - 20, j).map((x) => x.d));
      if (mum.d > enDusuk) continue; // dip mumu olmalı
      const kutuAlt = mum.d;
      const kutuUst = Math.min(mum.a, mum.k);
      // Tepki tepesi (W'nin ortası): kutudan çıkıp en az %5 yükseldikten sonra
      // fiyatın kutuya İLK döndüğü mum ikinci dip; tepe o ana kadarki en yüksek.
      let tepe = -Infinity;
      let tepeI = -1;
      let ikinciDipI = -1;
      let bozuldu = false;
      for (let t = j + 1; t <= i; t++) {
        if (ikinciDipI < 0) {
          if (m[t].y > tepe) { tepe = m[t].y; tepeI = t; }
          if (tepe >= kutuUst * 1.05 && t > tepeI && m[t].d <= kutuUst * 1.01) ikinciDipI = t;
        }
        if (m[t].k < kutuAlt) { bozuldu = true; break; }
      }
      if (ikinciDipI < 0 || bozuldu) continue;
      const ortaUstKapanis = m[i].k > tepe && ikinciDipI < i;
      return eslesme(s, 'kuyruklu-w', '1d', ortaUstKapanis ? 'al' : 'izle', 100,
        [
          `${i - j} gün önce uzun alt kuyruklu dip mumu: kutu ${f2(kutuAlt)} - ${f2(kutuUst)}.`,
          `Tepki tepesi ${f2(tepe)}; fiyat kutuya döndü, kapanış kutunun altına inmedi.`,
          ortaUstKapanis ? `Bugünkü kapanış W'nin orta tepesinin (${f2(tepe)}) üstünde: şartlar tamam.` : `W'nin orta tepesi ${f2(tepe)} üstünde kapanış bekleniyor.`,
        ],
        { 'Kutu alt': kutuAlt, 'Kutu üst': kutuUst, 'Orta tepe': tepe });
    }
    return null;
  },
};

/** 6.7 — Yüksek ve dar bayrak: 40 günde ≥%90, son 15 gün sığ (<%25) ve dar. */
export const darBayrak: Tarayici = {
  id: 'k-dar-bayrak',
  tara(s) {
    const m = s['1d'];
    const i = m.length - 1;
    if (i < 60) return null;
    const direkBas = i - 55;
    const direkSon = i - 15;
    let enD = Infinity;
    let enDI = direkBas;
    for (let j = direkBas; j <= direkSon; j++) if (m[j].d < enD) { enD = m[j].d; enDI = j; }
    let enY = -Infinity;
    let enYI = enDI;
    for (let j = enDI; j <= direkSon; j++) if (m[j].y > enY) { enY = m[j].y; enYI = j; }
    const getiri = enY / enD - 1;
    if (getiri < 0.9 || enYI - enDI > 40) return null;
    const bayrak = m.slice(enYI + 1, i + 1);
    if (bayrak.length < 5 || bayrak.length > 20) return null;
    const bayrakDip = Math.min(...bayrak.map((x) => x.d));
    const derinlik = 1 - bayrakDip / enY;
    if (derinlik > 0.25) return null;
    const kirildi = m[i].k > enY;
    return eslesme(s, 'k-dar-bayrak', '1d', kirildi ? 'al' : 'izle', 100,
      [
        `Direk: ${enYI - enDI} günde ${f2(enD)} → ${f2(enY)} (%${(getiri * 100).toFixed(0)}).`,
        `Bayrak: ${bayrak.length} gün, derinlik %${(derinlik * 100).toFixed(0)} (sınır %25).`,
        kirildi ? 'Bayrağın tepesi kapanışla aşıldı.' : `Kırılım seviyesi ${f2(enY)} bekleniyor.`,
      ],
      { 'Bayrak tepesi': enY, 'Hedef (direk boyu)': enY + (enY - enD) });
  },
};

/** 6.10 — 52 haftalık zirve kırılımı, hacim ≥1,5x; endeks nabzı pozitifken 100, değilse 60. */
export const zirve52: Tarayici = {
  id: 'k-52-hafta',
  tara(s, o) {
    const m = s['1d'];
    const i = m.length - 1;
    if (i < 260) return null;
    const onceki = Math.max(...m.slice(i - 252, i).map((x) => x.k));
    if (m[i].k <= onceki) return null;
    const kat = m[i].h / (hacimOrt(m, 50, i - 1) || 1);
    if (kat < 1.5) return null;
    const nabiz = o.endeksNabzi[s.piyasa === 'BIST' ? 'XU100' : 'SPX']?.pozitif;
    return eslesme(s, 'k-52-hafta', '1d', 'al', nabiz ? 100 : 60,
      [`Kapanış ${f2(m[i].k)}, son 52 haftanın zirvesi ${f2(onceki)} aşıldı.`, `Hacim 50 gün ortalamasının ${kat.toFixed(1).replace('.', ',')} katı.`, nabiz ? 'Endeks Nabzı pozitif.' : 'Endeks Nabzı negatif: güven düşürüldü.'],
      { 'Eski zirve (kutu tabanı)': onceki });
  },
};
