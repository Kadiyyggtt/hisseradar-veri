import type { Tarayici } from '../tipler';
import { asagiKesti, ema, sma, sonYukariKesisme, yukariKesti } from '../gostergeler/ortalama';
import { hacimOrt } from '../gostergeler/pivot';
import { eslesme, f2, kapanislar } from './ortak';

/** 3.1 — 200 günlük EMA'yı son 3 mumda kesenler. */
export const ema200: Tarayici = {
  id: 'ema200',
  tara(s) {
    const m = s['1d'];
    const k = kapanislar(m);
    const e = ema(k, 200);
    for (let g = 0; g < 3; g++) {
      const i = m.length - 1 - g;
      if (yukariKesti(k, e, i))
        return eslesme(s, 'ema200', '1d', 'al', 100,
          [`Kapanış ${f2(m[i].k)} ile 200 günlük EMA (${f2(e[i])}) ${g === 0 ? 'bugün' : g + ' gün önce'} yukarı kesildi.`, 'Trend sağlıklı bölgeye döndü.'],
          { 'EMA 200': e[i] });
      if (asagiKesti(k, e, i))
        return eslesme(s, 'ema200', '1d', 'sat', 100,
          [`Kapanış ${f2(m[i].k)} ile 200 günlük EMA (${f2(e[i])}) ${g === 0 ? 'bugün' : g + ' gün önce'} aşağı kesildi.`, 'Trendde bozulma; temkin.'],
          { 'EMA 200': e[i] });
    }
    return null;
  },
};

/** 3.2 — 200 altına inmiş, yeniden üstüne çıkmış (son 5 mum). */
export const ema200Donus: Tarayici = {
  id: 'ema200-donus',
  tara(s) {
    const m = s['1d'];
    const k = kapanislar(m);
    const e = ema(k, 200);
    const g = sonYukariKesisme(k, e, 5);
    if (g < 0) return null;
    const i = m.length - 1 - g;
    // Kesişmeden önce en az 10 mum altında kalmış olsun; yoksa sadece gürültü.
    let altinda = 0;
    for (let j = i - 1; j >= Math.max(0, i - 40) && k[j] < e[j]; j--) altinda++;
    if (altinda < 10) return null;
    return eslesme(s, 'ema200-donus', '1d', 'al', 100,
      [`Fiyat ${altinda} gün 200 günlük EMA'nın altında kaldı, ${g === 0 ? 'bugün' : g + ' gün önce'} yeniden üstüne çıktı.`, `EMA 200: ${f2(e[m.length - 1])}.`],
      { 'EMA 200': e[m.length - 1] });
  },
};

/** 3.3 — 30 haftalık ortalama: altına inip yeniden üstüne çıkanlar (son 2 hafta). */
export const sma30w: Tarayici = {
  id: 'sma30w',
  tara(s) {
    const m = s['1w'];
    if (m.length < 40) return null;
    const k = kapanislar(m);
    const o = sma(k, 30);
    const g = sonYukariKesisme(k, o, 2);
    if (g < 0) return null;
    const i = m.length - 1 - g;
    return eslesme(s, 'sma30w', '1w', 'al', 100,
      [`Haftalık kapanış 30 haftalık ortalamayı (${f2(o[i])}) ${g === 0 ? 'bu hafta' : 'geçen hafta'} yukarı kesti.`, 'Kâr hedefi %10-15, stop 30 haftalık altı.'],
      { 'Ort 30h': o[i], 'Hedef %10': m[i].k * 1.1, 'Hedef %15': m[i].k * 1.15 });
  },
};

/** 3.5 — Hisse 4 saatlikte EMA8 > EMA89 kesişmesi; endeks nabzı pozitifken. */
export const hisse889: Tarayici = {
  id: 'hisse-8-89',
  sart: (o, p) => o.endeksNabzi[p === 'BIST' ? 'XU100' : 'SPX']?.pozitif === true,
  tara(s) {
    const m = s['4h'];
    if (m.length < 120) return null;
    const k = kapanislar(m);
    const e8 = ema(k, 8);
    const e89 = ema(k, 89);
    const g = sonYukariKesisme(e8, e89, 2);
    if (g < 0) return null;
    return eslesme(s, 'hisse-8-89', '4h', 'al', 100,
      ['4 saatlikte EMA 8, EMA 89\'u yukarı kesti.', 'Endeks Nabzı 8/20 pozitif, şart sağlanıyor.', 'Başarı ölçüsü: %3 kâr.'],
      { 'EMA 8': e8[m.length - 1], 'EMA 89': e89[m.length - 1], 'Hedef %3': m[m.length - 1].k * 1.03 });
  },
};

/** 3.6 — Saatlik 9/26 kesişmesi (son 3 mum). */
export const saatlik926: Tarayici = {
  id: 'saatlik-9-26',
  tara(s, o) {
    const m = s['1h'];
    if (m.length < 60) return null;
    const k = kapanislar(m);
    const e9 = ema(k, 9);
    const e26 = ema(k, 26);
    const g = sonYukariKesisme(e9, e26, 3);
    if (g < 0) return null;
    const nabiz = o.endeksNabzi[s.piyasa === 'BIST' ? 'XU100' : 'SPX']?.pozitif;
    return eslesme(s, 'saatlik-9-26', '1h', 'al', nabiz ? 100 : 70,
      ['Saatlikte EMA 9, EMA 26\'yı yukarı kesti (erken sinyal).', nabiz ? 'Endeks Nabzı pozitif: isabet artar.' : 'Endeks Nabzı negatif: ilk parça için bile dikkat.'],
      { 'EMA 9': e9[m.length - 1], 'EMA 26': e26[m.length - 1] });
  },
};

/** 3.7 — Düğüm: EMA 5/8/13/21 aralığı fiyatın %1,5'inden dar. */
export const dugum: Tarayici = {
  id: 'dugum',
  tara(s) {
    const m = s['1d'];
    const k = kapanislar(m);
    const es = [5, 8, 13, 21].map((p) => ema(k, p));
    const i = m.length - 1;
    const d = es.map((e) => e[i]);
    const en = Math.max(...d) - Math.min(...d);
    const oran = en / m[i].k;
    if (oran > 0.015) return null;
    return eslesme(s, 'dugum', '1d', 'izle', 100,
      [`EMA 5, 8, 13 ve 21 birbirine ${(oran * 100).toFixed(2).replace('.', ',')}% içinde düğümlendi.`, 'Kırılım yakın; yönü hacim gösterecek.'],
      { 'EMA 5': d[0], 'EMA 21': d[3] });
  },
};

/** 3.8 — Altın kesişme 50/200 (günlük, son 3 mum) veya haftalık 8/30 (son 2 hafta). */
export const altinKesisme: Tarayici = {
  id: 'altin-kesisme',
  tara(s) {
    const g1 = s['1d'];
    const k1 = kapanislar(g1);
    const e50 = ema(k1, 50);
    const e200 = ema(k1, 200);
    const a = sonYukariKesisme(e50, e200, 3);
    if (a >= 0)
      return eslesme(s, 'altin-kesisme', '1d', 'al', 100,
        ['Günlükte EMA 50, EMA 200\'ü yukarı kesti (altın kesişme).', 'Ralli başlangıcı olabilir; tek başına yeterli değil.'],
        { 'EMA 50': e50[g1.length - 1], 'EMA 200': e200[g1.length - 1] });
    const h = s['1w'];
    if (h.length < 40) return null;
    const kh = kapanislar(h);
    const e8 = ema(kh, 8);
    const e30 = ema(kh, 30);
    const b = sonYukariKesisme(e8, e30, 2);
    if (b >= 0)
      return eslesme(s, 'altin-kesisme', '1w', 'al', 100,
        ['Haftalıkta EMA 8, EMA 30\'u yukarı kesti.', 'Derin düzeltmenin bittiğini haber verebilir.'],
        { 'EMA 8h': e8[h.length - 1], 'EMA 30h': e30[h.length - 1] });
    return null;
  },
};

/** 3.9 — Aylık 10 ortalaması önceki 3 ayın en yüksek hacminden büyük hacimle geçildi. */
export const aylik510: Tarayici = {
  id: 'aylik-5-10',
  tara(s) {
    const m = s['1mo'];
    if (m.length < 14) return null;
    const k = kapanislar(m);
    const e10 = ema(k, 10);
    const i = m.length - 1;
    if (!yukariKesti(k, e10, i)) return null;
    const oncekiEnYuksek = Math.max(...m.slice(i - 3, i).map((x) => x.h));
    if (m[i].h <= oncekiEnYuksek) return null;
    return eslesme(s, 'aylik-5-10', '1mo', 'izle', 100,
      ['Aylık kapanış 10 aylık ortalamayı geçti.', 'Bu ayın hacmi önceki 3 ayın en yükseğini aştı.', 'Tek başına sinyal değil; takip listesine.'],
      { 'EMA 10a': e10[i] });
  },
};

/** 3.10 — Fibonacci Merdiveni 55/89/144/233. */
export const fibMerdiveni: Tarayici = {
  id: 'fib-merdiveni',
  tara(s) {
    const m = s['1d'];
    if (m.length < 260) return null;
    const k = kapanislar(m);
    const [e55, e89, e144, e233] = [55, 89, 144, 233].map((p) => ema(k, p));
    const i = m.length - 1;
    const sirali = (j: number) => e55[j] > e89[j] && e89[j] > e144[j] && e144[j] > e233[j];
    if (!sirali(i)) return null;
    // Son 60 mum içinde fiyat 144-233 bölgesine dalmış mı?
    let daldi = -1;
    for (let j = i; j >= Math.max(0, i - 60); j--) {
      if (!sirali(j)) return null; // sıralama bir ara bozulduysa geçersiz
      if (m[j].d <= e144[j] && m[j].d >= e233[j] * 0.99) {
        daldi = j;
        break;
      }
    }
    if (daldi < 0) return null;
    const ustte = m[i].k > e55[i];
    const gecisBugun = sonYukariKesisme(k, e55, 3) >= 0;
    const bolgede = m[i].k <= e144[i] && m[i].k >= e233[i];
    if (!gecisBugun && !bolgede) return null;
    return eslesme(s, 'fib-merdiveni', '1d', gecisBugun ? 'al' : 'izle', 100,
      [
        'EMA 55 > 89 > 144 > 233 sıralı dizilim bozulmamış.',
        `Fiyat ${i - daldi} gün önce 144-233 bölgesine indi.`,
        gecisBugun ? 'Bugün en üstteki ortalama (EMA 55) yukarı geçildi: al sinyali.' : 'Henüz bölgede; EMA 55 boyun çizgisi, geçilince al.',
        ustte ? '' : '',
      ].filter(Boolean),
      { 'EMA 55 (boyun)': e55[i], 'EMA 144': e144[i], 'EMA 233': e233[i] });
  },
};

/** 3.11 — 200 Sıkışması. */
export const sikisma200: Tarayici = {
  id: '200-sikismasi',
  tara(s) {
    const m = s['1d'];
    if (m.length < 230) return null;
    const k = kapanislar(m);
    const e8 = ema(k, 8);
    const e200 = ema(k, 200);
    const i = m.length - 1;
    // Son 30 mumda fiyat 200'e dokunmuş (düşük, 200'ün %1,5 bandında) ve 8 ile 200 arası dar olmuş.
    let dokundu = -1;
    for (let j = i; j >= i - 30; j--) {
      if (Math.abs(m[j].d - e200[j]) / e200[j] <= 0.015 && Math.abs(e8[j] - e200[j]) / e200[j] <= 0.03) {
        dokundu = j;
        break;
      }
    }
    if (dokundu < 0) return null;
    const gecis = sonYukariKesisme(k, e8, i - dokundu + 1);
    if (gecis < 0) return null;
    const gecisI = i - gecis;
    // Geçişten sonraki tepe ve ilk düşük.
    let tepe = -Infinity;
    let tepeI = gecisI;
    for (let j = gecisI; j <= i; j++) if (m[j].y > tepe) { tepe = m[j].y; tepeI = j; }
    let dip = Infinity;
    for (let j = tepeI; j <= i; j++) if (m[j].d < dip) dip = m[j].d;
    const dusukYapti = tepeI < i && dip < tepe * 0.985;
    const seviye618 = dip + (tepe - dip) * 0.618;
    const alSinyali = dusukYapti && m[i].k > seviye618 && m[i - 1].k <= seviye618;
    if (!dusukYapti && gecis > 10) return null;
    return eslesme(s, '200-sikismasi', '1d', alSinyali ? 'al' : 'izle', 100,
      [
        `Fiyat ${i - dokundu} gün önce 200 günlük EMA'ya (${f2(e200[dokundu])}) dokundu, 8 ile 200 arasında sıkıştı.`,
        `${gecis} gün önce EMA 8'i yukarı geçti; tepe ${f2(tepe)}.`,
        dusukYapti ? `İlk düşük ${f2(dip)}; %61,8 seviyesi ${f2(seviye618)}${alSinyali ? ' bugün geçildi: AL' : ' bekleniyor'}.` : 'Geçişten sonraki ilk düşük bekleniyor.',
      ],
      { 'EMA 200': e200[i], 'EMA 8': e8[i], '%61,8': seviye618, Tepe: tepe });
  },
};

/** Hacim yardımcı: son mum hacmi 20 gün ortalamasının kaç katı. */
export function hacimKati(s: Seriler): number {
  const m = s['1d'];
  const ort = hacimOrt(m, 20, m.length - 2);
  return ort ? m[m.length - 1].h / ort : 0;
}
import type { Seriler } from '../tipler';
