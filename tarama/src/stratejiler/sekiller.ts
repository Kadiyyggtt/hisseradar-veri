import type { Mum, Seriler, Tarayici } from '../tipler';
import { egim, hacimOrt, pivotlar, yakin } from '../gostergeler/pivot';
import { bacaklar, cizgi, eslesme, f2, iyelikEki, nokta } from './ortak';

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
  const bas = Math.min(tepeler[0].i, dipler[0].i);
  return { ust, alt, ustE, altE, tepeler, dipler, i, fiyat, bas, genislik: deger(ust, dipler[0].i) - deger(alt, dipler[0].i) };
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
      [`${tur === 'simetrik' ? 'Simetrik' : tur === 'yukselen' ? 'Yükselen' : 'Alçalan'} üçgen: Üst çizgi ${f2(ustS)}, alt çizgi ${f2(altS)}. Aralık daralıyor.`,
       yukariKirdi ? `Üst çizgi kapanışla kırıldı${kat >= 1.5 ? '. Hacim ortalamanın ' + kat.toFixed(1).replace('.', ',') + ' katı.' : '. Hacim zayıf, kırılım sahte olabilir.'}` : asagiKirdi ? 'Alt çizgi aşağı kırıldı.' : 'Kırılım bekleniyor, hacme bakılmalı.',
       `Hedef: Üçgenin boyu (${f2(k.genislik)}) kırılım noktasına eklenir.`],
      { 'Üst çizgi': ustS, 'Alt çizgi': altS, 'Hedef (yukarı)': ustS + k.genislik, 'Hedef (aşağı)': altS - k.genislik },
      { cizgiler: [cizgi(nokta(m, k.bas, deger(ust, k.bas), ''), nokta(m, i, ustS, ''), 'trend'), cizgi(nokta(m, k.bas, deger(alt, k.bas), ''), nokta(m, i, altS, ''), 'trend')] });
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
      [`${tur === 'alcalan' ? 'Alçalan' : 'Yükselen'} kama: Dipler ve tepeler birlikte ${tur === 'alcalan' ? 'alçalıyor' : 'yükseliyor'}, çizgiler birbirine yaklaşıyor.`,
       kirildi ? `${tur === 'alcalan' ? 'Üst' : 'Alt'} çizgi kırıldı. ${tur === 'alcalan' ? 'Yükseliş' : 'Düşüş'} beklenir.` : 'Kırılım bekleniyor.',
       `Hedef: Kamanın başladığı seviye olan ${f2(basi)}.`],
      { 'Üst çizgi': ustS, 'Alt çizgi': altS, 'Hedef (kamanın başı)': basi },
      { cizgiler: [cizgi(nokta(m, k.bas, deger(ust, k.bas), ''), nokta(m, i, ustS, ''), 'trend'), cizgi(nokta(m, k.bas, deger(alt, k.bas), ''), nokta(m, i, altS, ''), 'trend')] });
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
      [`Dikdörtgen: Üst yatay ${f2(ustS)} seviyesinde ${temasUst} kez, alt yatay ${f2(altS)} seviyesinde ${temasAlt} kez test edildi.`,
       yon === 'al' ? `Üst yatay kırıldı. Hacim ortalamanın ${kat.toFixed(1).replace('.', ',')} katı.` : yon === 'sat' ? 'Alt yatay kırıldı.' : 'Fiyat kutunun içinde, kırılım bekleniyor.',
       `Hedef: Kutunun boyu (${f2(ustS - altS)}) kırılım noktasına eklenir.`],
      { 'Üst yatay': ustS, 'Alt yatay': altS, 'Hedef (yukarı)': ustS + (ustS - altS), 'Hedef (aşağı)': altS - (ustS - altS) },
      { noktalar: [...k.tepeler.filter((q) => yakin(q.fiyat, ustS, 2)), ...k.dipler.filter((q) => yakin(q.fiyat, altS, 2))].map((q) => nokta(m, q.i, q.fiyat, '')), cizgiler: [cizgi(nokta(m, k.bas, ustS, ''), nokta(m, k.i, ustS, ''), 'boyun'), cizgi(nokta(m, k.bas, altS, ''), nokta(m, k.i, altS, ''), 'boyun')] });
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
        [`Direk: ${bezBas - dipI} mumda ${f2(m[dipI].d)} seviyesinden ${f2(m[bezBas].k)} seviyesine yüzde ${(direk * 100).toFixed(0)} yükseliş.`,
         `Bez: ${bez} mum sürdü, derinliği yüzde ${(bezDerinlik * 100).toFixed(0)}. Hafif aşağı ya da yatay seyir.`,
         kirildi ? `Bezin üstü (${f2(bezUst)}) kapanışla aşıldı. Hacim ortalamanın ${kat.toFixed(1).replace('.', ',')} katı.` : `${f2(bezUst)} seviyesinin kırılması bekleniyor.`,
         'Klasik hedef direk boyudur. 1-2-3 döngüsündeki yerine bakmadan alınmaz.'],
        { 'Bezin üstü': bezUst, 'Hedef (direk boyu)': bezUst + (m[bezBas].k - m[dipI].d) },
        { noktalar: [nokta(m, dipI, m[dipI].d, 'Direk'), nokta(m, bezBas, m[bezBas].k, 'Bez')], cizgiler: [cizgi(nokta(m, dipI, m[dipI].d, ''), nokta(m, bezBas, m[bezBas].k, ''), 'bacak'), cizgi(nokta(m, bezBas, bezUst, ''), nokta(m, i, bezUst, ''), 'boyun')] });
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
      // Sağ dudak: dudağa ilk yaklaşımdan kulp başlangıcına kadarki en yüksek mum (ilk temas değil, gerçek dudak).
      for (let j = sagI + 1; j < i - 3; j++) if (m[j].y >= m[sagI].y) sagI = j;
      const sagDudak = m[sagI].y;
      if (!yakin(sagDudak, solDudak, 6)) continue;
      const kulp = m.slice(sagI, i + 1);
      if (kulp.length < 4 || kulp.length > 25) continue;
      const kulpDip = Math.min(...kulp.map((x) => x.d));
      const kulpDerinlik = 1 - kulpDip / sagDudak;
      if (kulpDerinlik > derinlik / 3 || kulpDip < dip + (sagDudak - dip) * 0.5) continue;
      const boyun = Math.max(solDudak, sagDudak);
      const kirildi = m[i].k > boyun;
      // Kırılım taze olmalı: boyun üstündeki ilk kapanış en çok 3 mum önce. Haftalar önce kırılıp uzaklaşmış hisse sinyal değildir.
      const ilkKirilim = kulp.findIndex((x) => x.k > boyun);
      if (kirildi && kulp.length - 1 - ilkKirilim > 3) continue;
      const kat = m[i].h / (hacimOrt(m, 20, i - 1) || 1);
      return eslesme(s, 'fincan-kulp', '1d', kirildi ? 'al' : 'izle', kirildi ? (kat >= 1.5 ? 80 : 60) : 55,
        [`Fincan: ${uzunluk} mum sürdü, derinliği yüzde ${(derinlik * 100).toFixed(0)}. Dip ${f2(dip)} ile ortada, yani U biçiminde.`,
         `Kulp: ${kulp.length} mum sürdü, derinliği yüzde ${(kulpDerinlik * 100).toFixed(0)}. Fincanın üst yarısında kaldı.`,
         kirildi ? `Boyun çizgisi (${f2(boyun)}) kapanışla aşıldı. Hacim ortalamanın ${kat.toFixed(1).replace('.', ',')} katı.` : `Boyun çizgisinin (${f2(boyun)}) aşılması bekleniyor.`],
        { Boyun: boyun, 'Hedef (bir boy)': boyun + (boyun - dip), 'Hedef (iki boy)': boyun + 2 * (boyun - dip) },
        (() => { const kulpDipI = sagI + kulp.reduce((en, x, j, a) => (x.d < a[en].d ? j : en), 0); const n = [nokta(m, bas, solDudak, 'Dudak'), nokta(m, dipI, dip, 'Dip'), nokta(m, sagI, sagDudak, 'Dudak'), nokta(m, kulpDipI, kulpDip, 'Kulp')]; return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, bas, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
    }
    return null;
  },
};

/** 2.6b — Ters fincan kulp: tepede ters U (30-120 mum), sağ dudak sol dudağa yakın, kısa sığ ters kulp, boyun aşağı kırılımı. Dağıtım. */
export const tersFincanKulp: Tarayici = {
  id: 'ters-fincan-kulp',
  tara(s) {
    const m = s['1d'];
    const i = m.length - 1;
    if (i < 80) return null;
    for (let uzunluk = 130; uzunluk >= 30; uzunluk -= 5) {
      const bas = i - uzunluk;
      if (bas < 20) continue;
      const solDudak = Math.min(...m.slice(bas, bas + 5).map((x) => x.d));
      const tepeI = bas + m.slice(bas, i).reduce((en, x, j, a) => (x.y > a[en].y ? j : en), 0);
      const tepe = m[tepeI].y;
      const yukseklik = tepe / solDudak - 1;
      if (yukseklik < 0.12 || yukseklik > 0.6) continue;
      const konum = (tepeI - bas) / uzunluk;
      if (konum < 0.3 || konum > 0.7) continue;
      let sagI = -1;
      for (let j = tepeI + 1; j < i - 3; j++) if (m[j].d <= solDudak * 1.04) { sagI = j; break; }
      if (sagI < 0) continue;
      // Sağ dudak: dudağa ilk inişten kulp başlangıcına kadarki en düşük mum.
      for (let j = sagI + 1; j < i - 3; j++) if (m[j].d <= m[sagI].d) sagI = j;
      const sagDudak = m[sagI].d;
      if (!yakin(sagDudak, solDudak, 6)) continue;
      const kulp = m.slice(sagI, i + 1);
      if (kulp.length < 4 || kulp.length > 25) continue;
      const kulpTepe = Math.max(...kulp.map((x) => x.y));
      const kulpYukseklik = kulpTepe / sagDudak - 1;
      // Ters kulp gerçek bir sıçrama olmalı (en az yüzde 2); sıçramasız düşüş "kulp" değil, süren düşüştür.
      if (kulpYukseklik < 0.02 || kulpYukseklik > yukseklik / 3 || kulpTepe > tepe - (tepe - sagDudak) * 0.5) continue;
      const boyun = Math.min(solDudak, sagDudak);
      const kirildi = m[i].k < boyun;
      // Kırılım taze olmalı: boyun altındaki ilk kapanış en çok 3 mum önce.
      const ilkKirilim = kulp.findIndex((x) => x.k < boyun);
      if (kirildi && kulp.length - 1 - ilkKirilim > 3) continue;
      if (!kirildi && m[i].k < boyun * 0.97) continue;
      const kat = m[i].h / (hacimOrt(m, 20, i - 1) || 1);
      const boy = tepe - boyun;
      return eslesme(s, 'ters-fincan-kulp', '1d', kirildi ? 'sat' : 'izle', kirildi ? (kat >= 1.5 ? 80 : 60) : 55,
        [`Ters fincan: ${uzunluk} mum süren yuvarlak tepe, yüksekliği yüzde ${(yukseklik * 100).toFixed(0)}. Tepe ${f2(tepe)} ortada, yani ters U biçiminde: aylar süren dağıtım.`,
         `Ters kulp: ${kulp.length} mum süren sığ bir sıçrama (yüzde ${(kulpYukseklik * 100).toFixed(0)}), fincanın alt yarısında kaldı. Boyun seviyesine son bir alıcı daha çekildi.`,
         kirildi ? `Boyun çizgisi (${f2(boyun)}) kapanışla aşağı kırıldı. Hacim ortalamanın ${kat.toFixed(1).replace('.', ',')} katı. Elde mal varsa burası çıkış yeridir.` : `Boyun çizgisinin (${f2(boyun)}) aşağı kırılması bekleniyor; elde mal varsa stop boyundur.`],
        { Boyun: boyun, 'Hedef (bir boy aşağı)': boyun - boy, 'Hedef (iki boy aşağı)': boyun - 2 * boy, 'Stop (kulp tepesi)': kulpTepe },
        (() => { const kulpTepeI = sagI + kulp.reduce((en, x, j, a) => (x.y > a[en].y ? j : en), 0); const n = [nokta(m, bas, solDudak, 'Dudak'), nokta(m, tepeI, tepe, 'Tepe'), nokta(m, sagI, sagDudak, 'Dudak'), nokta(m, kulpTepeI, kulpTepe, 'Kulp')]; return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, bas, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
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
      [`${pozitif ? 'Pozitif' : 'Negatif'} sayım: 1 noktası ${f2(dalga[0].fiyat)} (en büyük dalga, yüzde ${(enBuyuk * 100).toFixed(0)}), 2 noktası ${f2(dalga[1].fiyat)}, 3 noktası ${f2(dalga[2].fiyat)}, 4 noktası ${f2(dalga[3].fiyat)}, 5 noktası ${f2(bes.fiyat)}.`,
       `5 numaralı bölge oluştu. Burası ${pozitif ? 'al' : 'sat'} şartının aranacağı yerdir${w ? '. W ya da ters W ihtimali var, marj beklentisi yüksek' : ''}.`,
       'Heikin Ashi teyidiyle giriş yapılır, ardından hemen ters sayım yapılır.'],
      { '5 noktası': bes.fiyat, '4 noktası': dalga[3].fiyat },
      (() => { const n = dalga.map((q, k) => nokta(m, q.i, q.fiyat, String(k + 1))); return { noktalar: n, cizgiler: bacaklar(n) }; })());
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
      [`${dususABCD ? 'Düşüş' : 'Yükseliş'} ABCD: C noktası, A ile B arasının yüzde ${(c * 100).toFixed(1).replace('.', ',')}${iyelikEki(Math.round(((c * 100) % 1) * 10) || Math.round(c * 100))}ni geri aldı. Bu, yüzde 61,8 ya da 78,6 kuralına uyuyor.`,
       `D hedefleri: yüzde 127,2 için ${f2(h1)}, yüzde 161,8 için ${f2(h2)}. Fiyat hedef bölgesinde.`,
       `Zaman: A'dan B'ye ${abSure} mum, C'den D'ye ${cdSure} mum${yakin(abSure, cdSure, 25) ? '. AB eşittir CD zaman kuralı tutuyor.' : '.'}`],
      { 'Yüzde 127,2 hedefi': h1, 'Yüzde 161,8 hedefi': h2 },
      (() => { const n = [nokta(m, A.i, A.fiyat, 'A'), nokta(m, B.i, B.fiyat, 'B'), nokta(m, C.i, C.fiyat, 'C'), nokta(m, D.i, m[i].k, 'D')]; return { noktalar: n, cizgiler: bacaklar(n) }; })());
  },
};

export type { Seriler };
