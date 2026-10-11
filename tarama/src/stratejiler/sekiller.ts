import type { Mum, Seriler, Tarayici } from '../tipler';
import { egim, hacimOrt, pivotlar, yakin } from '../gostergeler/pivot';
import { eslesme, f2 } from './ortak';

/**
 * ŞEKİL TARAYICILARI — üçgen, kama, dikdörtgen, bayrak, fincan-kulp,
 * beş dalga, klasik ABCD. Hepsi B sınıfı: pivot ve regresyonla yaklaşık.
 */

interface Cizgi { egim: number; sabit: number }

/** Pivot noktalarına en küçük kareler doğrusu (x = mum sırası). */
function dogru(p: { i: number; fiyat: number }[]): Cizgi {
  const n = p.length;
  const ox = p.reduce((s, q) => s + q.i, 0) / n;
  const oy = p.reduce((s, q) => s + q.fiyat, 0) / n;
  let pay = 0;
  let payda = 0;
  for (const q of p) {
    pay += (q.i - ox) * (q.fiyat - oy);
    payda += (q.i - ox) ** 2;
  }
  const e = payda === 0 ? 0 : pay / payda;
  return { egim: e, sabit: oy - e * ox };
}
const deger = (c: Cizgi, i: number) => c.sabit + c.egim * i;

/** Son 60 mumda en az 2 tepe + 2 dip pivotuyla üst ve alt çizgi. */
function kanal(m: Mum[], pencere = 60) {
  const i = m.length - 1;
  // Son pivot henüz onaylanmamış (bugünkü uç); kırılım mumunu çizgiye katmamak için atılır.
  const p = pivotlar(m.slice(i - pencere), 3).map((q) => ({ ...q, i: q.i + i - pencere })).filter((q) => q.i < i - 1);
  const tepeler = p.filter((q) => q.tur === 'tepe');
  const dipler = p.filter((q) => q.tur === 'dip');
  if (tepeler.length < 2 || dipler.length < 2) return null;
  const ust = dogru(tepeler);
  const alt = dogru(dipler);
  const fiyat = m[i].k;
  // Günlük eğim fiyatın yüzdesi olarak.
  const ustE = ust.egim / fiyat;
  const altE = alt.egim / fiyat;
  return { ust, alt, ustE, altE, tepeler, dipler, i, fiyat, genislik: deger(ust, dipler[0].i) - deger(alt, dipler[0].i) };
}

const YATAY = 0.0008; // günde %0,08'den az eğim yatay sayılır

/** 2.1 — Üçgenler. */
export const ucgenler: Tarayici = {
  id: 'ucgenler',
  tara(s) {
    const m = s['1d'];
    if (m.length < 80) return null;
    const k = kanal(m);
    if (!k) return null;
    const { ustE, altE, i, fiyat, ust, alt } = k;
    const daralma = deger(ust, i) - deger(alt, i) < k.genislik * 0.6;
    if (!daralma || k.genislik <= 0) return null;
    let tur: 'simetrik' | 'yukselen' | 'alcalan' | null = null;
    if (ustE < -YATAY && altE > YATAY) tur = 'simetrik';
    else if (Math.abs(ustE) <= YATAY && altE > YATAY) tur = 'yukselen';
    else if (ustE < -YATAY && Math.abs(altE) <= YATAY) tur = 'alcalan';
    if (!tur) return null;
    const ustS = deger(ust, i);
    const altS = deger(alt, i);
    const kat = m[i].h / (hacimOrt(m, 20, i - 1) || 1);
    const yukariKirdi = fiyat > ustS;
    const asagiKirdi = fiyat < altS;
    const yon = yukariKirdi ? 'al' : asagiKirdi ? 'sat' : 'izle';
    const guven = 50 + (yon !== 'izle' ? (kat >= 1.5 ? 30 : 10) : 0);
    return eslesme(s, 'ucgenler', '1d', yon, guven,
      [`${tur === 'simetrik' ? 'Simetrik' : tur === 'yukselen' ? 'Yükselen' : 'Alçalan'} üçgen: üst çizgi ${f2(ustS)}, alt çizgi ${f2(altS)}, daralıyor.`,
       yukariKirdi ? `Üst çizgi kapanışla kırıldı${kat >= 1.5 ? ', hacim ortalamanın ' + kat.toFixed(1).replace('.', ',') + ' katı.' : '; hacim zayıf, sahte olabilir.'}` : asagiKirdi ? 'Alt çizgi aşağı kırıldı.' : 'Kırılım bekleniyor; hacme bak.',
       `Hedef: üçgen boyu (${f2(k.genislik)}) kırılım noktasına eklenir.`],
      { 'Üst çizgi': ustS, 'Alt çizgi': altS, 'Hedef (yukarı)': ustS + k.genislik, 'Hedef (aşağı)': altS - k.genislik });
  },
};

/** 2.7 — Kama: dipler ve tepeler aynı yönde, yakınsıyor. */
export const kama: Tarayici = {
  id: 'kama',
  tara(s) {
    const m = s['1d'];
    if (m.length < 80) return null;
    const k = kanal(m);
    if (!k) return null;
    const { ustE, altE, i, fiyat, ust, alt } = k;
    const yakinsiyor = deger(ust, i) - deger(alt, i) < k.genislik * 0.7;
    if (!yakinsiyor) return null;
    let tur: 'yukselen' | 'alcalan' | null = null;
    if (ustE > YATAY && altE > YATAY && altE > ustE) tur = 'yukselen';
    if (ustE < -YATAY && altE < -YATAY && ustE < altE) tur = 'alcalan';
    if (!tur) return null;
    const ustS = deger(ust, i);
    const altS = deger(alt, i);
    const kirildi = tur === 'alcalan' ? fiyat > ustS : fiyat < altS;
    const basi = tur === 'alcalan' ? k.tepeler[0].fiyat : k.dipler[0].fiyat;
    return eslesme(s, 'kama', '1d', kirildi ? (tur === 'alcalan' ? 'al' : 'sat') : 'izle', kirildi ? 70 : 50,
      [`${tur === 'alcalan' ? 'Alçalan' : 'Yükselen'} kama: dipler ve tepeler birlikte ${tur === 'alcalan' ? 'alçalıyor' : 'yükseliyor'}, çizgiler yakınsıyor.`,
       kirildi ? `${tur === 'alcalan' ? 'Üst' : 'Alt'} çizgi kırıldı: ${tur === 'alcalan' ? 'yükseliş' : 'düşüş'} beklenir.` : 'Kırılım bekleniyor.',
       `Hedef: kamanın başladığı seviye ${f2(basi)}.`],
      { 'Üst çizgi': ustS, 'Alt çizgi': altS, 'Hedef (kama başı)': basi });
  },
};

/** 2.4 — Dikdörtgen: iki yatay, en az 2'şer temas, kırılım. */
export const dikdortgen: Tarayici = {
  id: 'dikdortgen',
  tara(s) {
    const m = s['1d'];
    if (m.length < 80) return null;
    const k = kanal(m, 50);
    if (!k) return null;
    if (Math.abs(k.ustE) > YATAY || Math.abs(k.altE) > YATAY) return null;
    const ustS = deger(k.ust, k.i);
    const altS = deger(k.alt, k.i);
    if ((ustS - altS) / altS < 0.04) return null; // çok dar
    const temasUst = k.tepeler.filter((q) => yakin(q.fiyat, ustS, 2)).length;
    const temasAlt = k.dipler.filter((q) => yakin(q.fiyat, altS, 2)).length;
    if (temasUst < 2 || temasAlt < 2) return null;
    const fiyat = k.fiyat;
    const kat = m[k.i].h / (hacimOrt(m, 20, k.i - 1) || 1);
    const yon = fiyat > ustS ? 'al' : fiyat < altS ? 'sat' : 'izle';
    return eslesme(s, 'dikdortgen', '1d', yon, yon === 'izle' ? 55 : kat >= 1.5 ? 85 : 60,
      [`Dikdörtgen: üst ${f2(ustS)} (${temasUst} temas), alt ${f2(altS)} (${temasAlt} temas).`,
       yon === 'al' ? `Üst yatay kırıldı, hacim ${kat.toFixed(1).replace('.', ',')}x.` : yon === 'sat' ? 'Alt yatay kırıldı.' : 'Kutunun içinde; kırılım bekleniyor.',
       `Hedef: kutu boyu (${f2(ustS - altS)}).`],
      { Üst: ustS, Alt: altS, 'Hedef (yukarı)': ustS + (ustS - altS), 'Hedef (aşağı)': altS - (ustS - altS) });
  },
};

/** 2.5 — Bayrak: dik direk (≤15 mumda ≥%12) + 5-15 mumluk hafif ters eğimli dar bez. */
export const bayrak: Tarayici = {
  id: 'bayrak',
  tara(s) {
    const m = s['1d'];
    const i = m.length - 1;
    if (i < 60) return null;
    for (const bez of [5, 7, 9, 12, 15]) {
      const bezBas = i - bez;
      const direkBas = bezBas - 15;
      if (direkBas < 0) continue;
      const dipI = direkBas + m.slice(direkBas, bezBas).reduce((en, x, j, a) => (x.d < a[en].d ? j : en), 0);
      const direk = m[bezBas].k / m[dipI].d - 1;
      if (direk < 0.12 || bezBas - dipI < 3) continue;
      const bezM = m.slice(bezBas, i + 1);
      const bezEgim = egim(bezM.map((x) => x.k)) / m[i].k;
      const bezDerinlik = 1 - Math.min(...bezM.map((x) => x.d)) / Math.max(...bezM.map((x) => x.y));
      if (bezEgim > 0.002 || bezDerinlik > 0.12) continue; // bez yukarı akmaz, derin olmaz
      const bezUst = Math.max(...bezM.slice(0, -1).map((x) => x.y));
      const kirildi = m[i].k > bezUst;
      const kat = m[i].h / (hacimOrt(m, 20, i - 1) || 1);
      return eslesme(s, 'bayrak', '1d', kirildi ? 'al' : 'izle', kirildi ? (kat >= 1.5 ? 75 : 55) : 50,
        [`Direk: ${bezBas - dipI} mumda %${(direk * 100).toFixed(0).replace('.', ',')} yükseliş (${f2(m[dipI].d)} → ${f2(m[bezBas].k)}).`,
         `Bez: ${bez} mum, derinlik %${(bezDerinlik * 100).toFixed(0).replace('.', ',')}, hafif aşağı/yatay.`,
         kirildi ? `Bezin üstü (${f2(bezUst)}) kapanışla aşıldı; hacim ${kat.toFixed(1).replace('.', ',')}x.` : `Kırılım seviyesi ${f2(bezUst)} bekleniyor.`,
         'Klasik hedef direk boyu; 1-2-3 bağlamına bakmadan alma.'],
        { 'Bez üstü': bezUst, 'Hedef (direk boyu)': bezUst + (m[bezBas].k - m[dipI].d) });
    }
    return null;
  },
};

/** 2.6 — Fincan-kulp: U tabanlı 30-120 mumluk çanak, sağ dudak sol dudağa yakın, kısa sığ kulp, boyun kırılımı. */
export const fincanKulp: Tarayici = {
  id: 'fincan-kulp',
  tara(s) {
    const m = s['1d'];
    const i = m.length - 1;
    if (i < 80) return null;
    // Uzundan kısaya: tam fincan, fincanın içinden alınmış yarım kesitten önce bulunsun.
    for (let uzunluk = 130; uzunluk >= 30; uzunluk -= 5) {
      const bas = i - uzunluk;
      if (bas < 20) continue;
      const solDudak = Math.max(...m.slice(bas, bas + 5).map((x) => x.y));
      const dipI = bas + m.slice(bas, i).reduce((en, x, j, a) => (x.d < a[en].d ? j : en), 0);
      const dip = m[dipI].d;
      const derinlik = 1 - dip / solDudak;
      if (derinlik < 0.12 || derinlik > 0.5) continue;
      // Dip ortalarda (U), uçlarda değil.
      const konum = (dipI - bas) / uzunluk;
      if (konum < 0.3 || konum > 0.7) continue;
      // Sağ dudak: dipten sonra fiyatın sol dudağa ilk kez %4 yaklaştığı mum
      // (son mum değil; kırılım mumu dudak sayılmaz).
      let sagI = -1;
      for (let j = dipI + 1; j < i - 3; j++) if (m[j].y >= solDudak * 0.96) { sagI = j; break; }
      if (sagI < 0) continue;
      const sagDudak = m[sagI].y;
      if (!yakin(sagDudak, solDudak, 6)) continue;
      const kulp = m.slice(sagI, i + 1);
      if (kulp.length < 4 || kulp.length > 25) continue;
      const kulpDip = Math.min(...kulp.map((x) => x.d));
      const kulpDerinlik = 1 - kulpDip / sagDudak;
      if (kulpDerinlik > derinlik / 3 || kulpDip < dip + (sagDudak - dip) * 0.5) continue;
      const boyun = Math.max(solDudak, sagDudak);
      const kirildi = m[i].k > boyun;
      const kat = m[i].h / (hacimOrt(m, 20, i - 1) || 1);
      return eslesme(s, 'fincan-kulp', '1d', kirildi ? 'al' : 'izle', kirildi ? (kat >= 1.5 ? 80 : 60) : 55,
        [`Fincan: ${uzunluk} mum, derinlik %${(derinlik * 100).toFixed(0).replace('.', ',')}, dip ${f2(dip)} ortada (U).`,
         `Kulp: ${kulp.length} mum, derinlik %${(kulpDerinlik * 100).toFixed(0).replace('.', ',')}, fincanın üst yarısında.`,
         kirildi ? `Boyun ${f2(boyun)} kapanışla aşıldı; hacim ${kat.toFixed(1).replace('.', ',')}x.` : `Boyun ${f2(boyun)} bekleniyor.`],
        { Boyun: boyun, 'Hedef (klasik ×1)': boyun + (boyun - dip), 'Hedef (×2)': boyun + 2 * (boyun - dip) });
    }
    return null;
  },
};

/** 2.12 — Beş dalga: son 90 mumda en büyük dalganın ucu 1, sonra 2-3-4-5; 5'te al/sat bölgesi. */
export const besDalga: Tarayici = {
  id: 'bes-dalga',
  tara(s) {
    const m = s['1d'];
    const i = m.length - 1;
    if (i < 100) return null;
    const p = pivotlar(m.slice(i - 90), 4).map((q) => ({ ...q, i: q.i + i - 90 }));
    if (p.length < 7) return null;
    // En büyük dalga: ardışık iki pivot arasındaki en büyük yüzde fark.
    let enBuyuk = 0;
    let bir = -1;
    for (let j = 1; j < p.length - 4; j++) {
      const fark = Math.abs(p[j].fiyat / p[j - 1].fiyat - 1);
      if (fark > enBuyuk) { enBuyuk = fark; bir = j; }
    }
    if (bir < 0 || p.length - bir < 5) return null;
    const dalga = p.slice(bir, bir + 5);
    const bes = dalga[4];
    if (i - bes.i > 4) return null;
    const pozitif = dalga[0].tur === 'dip'; // en büyük V'nin ucu dip → yükseliş sayımı
    const w = bes.tur === dalga[0].tur;
    return eslesme(s, 'bes-dalga', '1d', 'izle', 55,
      [`${pozitif ? 'Pozitif' : 'Negatif'} sayım: 1=${f2(dalga[0].fiyat)} (en büyük dalga, %${(enBuyuk * 100).toFixed(0).replace('.', ',')}), 2=${f2(dalga[1].fiyat)}, 3=${f2(dalga[2].fiyat)}, 4=${f2(dalga[3].fiyat)}, 5=${f2(bes.fiyat)}.`,
       `5 numaralı bölge oluştu: ${pozitif ? 'al' : 'sat'} sinyali aranacak yer${w ? ' (W/ters W ihtimali, marj beklentisi yüksek)' : ''}.`,
       'Heikin teyidiyle giriş; sonra hemen ters sayım yap.'],
      { '5 bölgesi': bes.fiyat, '4': dalga[3].fiyat });
  },
};

/** 2.9 — Klasik ABCD: C %61,8/%78,6, D %127,2/%161,8 bölgesinde. */
export const abcdKlasik: Tarayici = {
  id: 'abcd-klasik',
  tara(s) {
    const m = s['1d'];
    const p = pivotlar(m, 4);
    const i = m.length - 1;
    if (p.length < 4) return null;
    const [A, B, C] = p.slice(-4, -1);
    const D = p[p.length - 1];
    if (i - D.i > 3) return null;
    const dususABCD = A.tur === 'tepe' && B.tur === 'dip' && C.tur === 'tepe';
    const yukselisABCD = A.tur === 'dip' && B.tur === 'tepe' && C.tur === 'dip';
    if (!dususABCD && !yukselisABCD) return null;
    const c = Math.abs((C.fiyat - B.fiyat) / (A.fiyat - B.fiyat));
    const cUyar = yakin(c, 0.618, 6) || yakin(c, 0.786, 6);
    if (!cUyar) return null;
    const bc = B.fiyat - C.fiyat;
    const h1 = C.fiyat + bc * 1.272;
    const h2 = C.fiyat + bc * 1.618;
    const dYakin = yakin(m[i].k, h1, 2.5) || yakin(m[i].k, h2, 2.5);
    if (!dYakin) return null;
    const abSure = B.i - A.i;
    const cdSure = i - C.i;
    return eslesme(s, 'abcd-klasik', '1d', dususABCD ? 'al' : 'sat', yakin(abSure, cdSure, 25) ? 70 : 55,
      [`ABCD ${dususABCD ? 'düşüş' : 'yükseliş'}: C, A-B'nin %${(c * 100).toFixed(1).replace('.', ',')}'ini geri aldı (61,8/78,6 kuralı).`,
       `D hedefleri %127,2 = ${f2(h1)}, %161,8 = ${f2(h2)}; fiyat hedef bölgesinde.`,
       `Zaman: A-B ${abSure} mum, C-D ${cdSure} mum${yakin(abSure, cdSure, 25) ? ' (AB=CD zamanı tutuyor).' : '.'}`],
      { '%127,2': h1, '%161,8': h2 });
  },
};

export type { Seriler };
