import type { Periyot, Seriler, Tarayici } from '../tipler';
import { rsi } from '../gostergeler/rsi';
import { egim, geriAlma, hacimOrt, pivotlar, yakin } from '../gostergeler/pivot';
import { bacaklar, cizgi, eslesme, f2, hedefParcalari, iyelikEki, belirtmeEki, kapanislar, nokta } from './ortak';

/** Esnek ABCD D bölgesi yüzdesi: 1 bölü C yüzdesi, yüzde olarak yuvarlanır (84 → 119, 52 → 192, 95 → 105). */
export const esnekDYuzde = (yuzdeC: number): number => Math.round(10000 / yuzdeC);

/**
 * 2.14 — TOPUK DÖNÜŞÜ. Şartlar:
 *  1. Sert düşüş (topuk inişi): son 60 mum içinde ≤20 mumda ≥%15 düşüş.
 *  2. Dipten dik ve hacimli kalkış: ≤5 mumda ≥%6, kalkış mumlarının hacmi 20 gün ort. ≥1,5x.
 *  3. İşkence bölgesi: kalkıştan sonra ≥8 mum, fiyat yavaş aşağı/yatay sürüklenir
 *     (eğim ≤0), hacim kalkış hacminin yarısından az.
 *  4. RSI şartı: topuk dibi → bugün arasında RSI eğimi fiyat eğiminden dik yukarı.
 *  5. Yükseliş şartı: son mum kapanışı önceki 3 mumun üstünde (uç kıvrıldı) VE hacim
 *     işkence bölgesi ortalamasının üstünde.
 */
function topukDonusuTara(s: Seriler, periyot: Periyot): ReturnType<Tarayici['tara']> {
  const m = s[periyot];
  const n = m.length;
  if (n < 80) return null;
  const k = kapanislar(m);
  const r = rsi(k, 14);
  const i = n - 1;
  // 1. Topuk dibi: son 60 mumun en düşüğü, en az 10 mum önce.
  let dipI = -1;
  let dip = Infinity;
  for (let j = i - 60; j <= i - 10; j++) if (m[j].d < dip) { dip = m[j].d; dipI = j; }
  if (dipI < 20) return null;
  // Topuğun tepesi: dipten önceki 20 mumun en yükseği; çizim noktası da o mumda (pencerenin başında değil).
  const oncesiI = dipI - 20 + m.slice(dipI - 20, dipI).reduce((en, x, j, a) => (x.y > a[en].y ? j : en), 0);
  const oncesi = m[oncesiI].y;
  const dusus = 1 - dip / oncesi;
  if (dusus < 0.15) return null;
  // 2. Kalkış.
  let kalkisSon = dipI;
  let tepe = dip;
  for (let j = dipI + 1; j <= Math.min(i, dipI + 5); j++) if (m[j].y > tepe) { tepe = m[j].y; kalkisSon = j; }
  const kalkis = tepe / dip - 1;
  if (kalkis < 0.06) return null;
  const ort20 = hacimOrt(m, 20, dipI - 1) || 1;
  const kalkisHacim = hacimOrt(m, kalkisSon - dipI + 1, kalkisSon);
  if (kalkisHacim < ort20 * 1.5) return null;
  // 3. İşkence bölgesi.
  const bolge = m.slice(kalkisSon + 1, i + 1);
  if (bolge.length < 8) return null;
  const bolgeEgim = egim(bolge.map((x) => x.k)) / m[i].k;
  if (bolgeEgim > 0.001) return null; // belirgin yükseliş varsa işkence değil
  const bolgeHacim = hacimOrt(m, bolge.length - 1, i - 1);
  if (bolgeHacim > kalkisHacim * 0.6) return null;
  // 4. RSI eğimi fiyat eğiminden dik.
  const fiyatEgim = (m[i].k - dip) / dip;
  const rsiEgim = (r[i] - r[dipI]) / 100;
  if (!(rsiEgim > fiyatEgim + 0.02)) return null;
  // İştah.
  const tabanAlt = m[i].k < dip;
  const istah = fiyatEgim < 0 ? (tabanAlt ? 'ultra iştahlı' : 'iştahlı') : 'normal';
  // 5. Yükseliş şartı.
  const kivrildi = m[i].k > Math.max(m[i - 1].k, m[i - 2].k, m[i - 3].k);
  const hacimBari = m[i].h > bolgeHacim * 1.3;
  const al = kivrildi && hacimBari;
  const guven = 55 + (istah === 'ultra iştahlı' ? 20 : istah === 'iştahlı' ? 12 : 0) + (al ? 15 : 0);
  return eslesme(s, 'topuk-donusu', periyot, al ? 'al' : 'izle', Math.min(guven, 95),
    [
      `Topuk: Fiyat ${f2(oncesi)} seviyesinden ${f2(dip)} seviyesine yüzde ${(dusus * 100).toFixed(0)} sert düştü, ardından ${kalkisSon - dipI} mumda yüzde ${(kalkis * 100).toFixed(0)} yükseldi. Kalkış hacmi 20 günlük ortalamanın ${(kalkisHacim / ort20).toFixed(1).replace('.', ',')} katı.`,
      `İşkence bölgesi ${bolge.length} mum sürdü. Bu bölgedeki hacim, kalkış hacminin yüzde ${((bolgeHacim / kalkisHacim) * 100).toFixed(0)}${iyelikEki((bolgeHacim / kalkisHacim) * 100)} kadar.`,
      `RSI ${r[dipI].toFixed(0)} değerinden ${r[i].toFixed(0)} değerine çıktı. RSI çizgisi fiyat çizgisinden daha dik yukarı, formasyon ${istah}.`,
      al ? 'Uç yukarı kıvrıldı ve ölü bölgenin hacmi aşıldı. Yükseliş şartı sağlandı.' : kivrildi ? 'Uç yukarı kıvrıldı; hacim barı henüz gelmedi. Kural ikisini birlikte arar.' : 'Uç henüz yukarı kıvrılmadı.',
    ],
    { 'Topuk dibi': dip, 'Kalkış tepesi': tepe },
    { noktalar: [nokta(m, oncesiI, oncesi, 'Topuk'), nokta(m, dipI, dip, 'Dip'), nokta(m, kalkisSon, tepe, 'Kalkış'), nokta(m, i, m[i].k, 'Uç')], cizgiler: [cizgi(nokta(m, kalkisSon + 1, m[kalkisSon + 1].k, ''), nokta(m, i, m[i].k, ''), 'trend')] });
}

export const topukDonusu: Tarayici = {
  id: 'topuk-donusu',
  tara(s) {
    return topukDonusuTara(s, '1d') ?? (s['4h'].length > 120 ? topukDonusuTara(s, '4h') : null);
  },
};

/** 2.3 — İkili dip (W) ve ikili tepe (M), pivotlarla. */
export const ikiliTepeDip: Tarayici = {
  id: 'ikili-tepe-dip',
  tara(s) {
    const m = s['1d'];
    const p = pivotlar(m, 5);
    const r = rsi(kapanislar(m), 14);
    const i = m.length - 1;
    if (p.length < 4) return null;
    const son = p.slice(-4);
    // W: dip, tepe, dip, (tepe oluşuyor)
    const [a, b, c] = son;
    if (a.tur === 'dip' && b.tur === 'tepe' && c.tur === 'dip' && i - c.i <= 15 && c.i - a.i >= 10) {
      if (!yakin(c.fiyat, a.fiyat, 3)) return null;
      const boyun = b.fiyat;
      const kirildi = m[i].k > boyun;
      const hacimArtti = hacimOrt(m, 3, c.i + 1) > hacimOrt(m, 3, a.i + 1);
      const rsiIyi = r[c.i] > r[a.i];
      const guven = 50 + (hacimArtti ? 15 : 0) + (rsiIyi ? 15 : 0) + (kirildi ? 15 : 0);
      return eslesme(s, 'ikili-tepe-dip', '1d', kirildi ? 'al' : 'izle', guven,
        [`İkili dip: İki dip ${f2(a.fiyat)} ve ${f2(c.fiyat)} seviyelerinde, aralarındaki fark yüzde ${(Math.abs(c.fiyat / a.fiyat - 1) * 100).toFixed(1).replace('.', ',')}. Boyun çizgisi ${f2(boyun)}.`,
         hacimArtti ? 'İkinci dipte hacim arttı.' : 'İkinci dipte hacim artmadı.',
         rsiIyi ? 'RSI ikinci dipte daha yüksek, yani pozitif uyumsuzluk var.' : 'RSI uyumsuzluğu yok.',
         kirildi ? 'Boyun çizgisi kapanışla aşıldı.' : 'Boyun çizgisi henüz kırılmadı. Kural kapanışla kırılımı şart sayar.'],
        { Boyun: boyun, 'Hedef (formasyon boyu)': boyun + (boyun - Math.min(a.fiyat, c.fiyat)) },
        (() => { const n = [nokta(m, a.i, a.fiyat, '1'), nokta(m, b.i, b.fiyat, 'Boyun'), nokta(m, c.i, c.fiyat, '2')]; return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, a.i, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
    }
    if (a.tur === 'tepe' && b.tur === 'dip' && c.tur === 'tepe' && i - c.i <= 15 && c.i - a.i >= 10) {
      if (!yakin(c.fiyat, a.fiyat, 3)) return null;
      const boyun = b.fiyat;
      const kirildi = m[i].k < boyun;
      const hacimDustu = hacimOrt(m, 3, c.i) < hacimOrt(m, 3, a.i);
      const rsiIyi = r[c.i] < r[a.i];
      const guven = 50 + (hacimDustu ? 15 : 0) + (rsiIyi ? 15 : 0) + (kirildi ? 15 : 0);
      return eslesme(s, 'ikili-tepe-dip', '1d', kirildi ? 'sat' : 'izle', guven,
        [`İkili tepe: İki tepe ${f2(a.fiyat)} ve ${f2(c.fiyat)} seviyelerinde. Boyun çizgisi ${f2(boyun)}.`,
         hacimDustu ? 'İkinci tepede hacim düştü.' : 'İkinci tepede hacim düşmedi.',
         rsiIyi ? 'RSI ikinci tepede ilk tepeyi geçemedi, yani negatif uyumsuzluk var.' : 'RSI uyumsuzluğu yok.',
         kirildi ? 'Boyun çizgisi aşağı kırıldı.' : 'Boyun çizgisi henüz kırılmadı. Kural kapanışla kırılımı şart sayar.'],
        { Boyun: boyun, 'Hedef (formasyon boyu)': boyun - (Math.max(a.fiyat, c.fiyat) - boyun) },
        (() => { const n = [nokta(m, a.i, a.fiyat, '1'), nokta(m, b.i, b.fiyat, 'Boyun'), nokta(m, c.i, c.fiyat, '2')]; return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, a.i, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
    }
    return null;
  },
};

/** 2.8 — QM: yükseliş (3<1, 4>2, 5 → 1 seviyesi) ve düşüş (ayna). */
export const qm: Tarayici = {
  id: 'qm',
  tara(s) {
    const m = s['1d'];
    const p = pivotlar(m, 4);
    const i = m.length - 1;
    if (p.length < 5) return null;
    const [p1, p2, p3, p4, p5] = p.slice(-5);
    if (i - p5.i > 5) return null;
    // Yükseliş QM: 1 dip, 2 tepe, 3 dip (<1), 4 tepe (>2), 5 dip (≈1)
    if (p1.tur === 'dip' && p3.fiyat < p1.fiyat && p4.fiyat > p2.fiyat && p5.tur === 'dip') {
      const hedefBolge = p1.fiyat;
      const geldi = yakin(Math.min(p5.fiyat, m[i].d), hedefBolge, 3);
      if (!geldi) return null;
      const donus = m[i].k > m[i - 1].k;
      return eslesme(s, 'qm', '1d', donus ? 'al' : 'izle', donus ? 75 : 60,
        [`Yükseliş QM: 1 noktası ${f2(p1.fiyat)}, 3 noktası ${f2(p3.fiyat)} ile 1'in altında, 4 noktası ${f2(p4.fiyat)} ile 2 noktasını (${f2(p2.fiyat)}) aştı.`,
         `5 numaralı bacak 1 seviyesine (${f2(hedefBolge)}) geldi. Burası dönüş aranacak bölgedir.`,
         donus ? 'Son mum yukarı döndü.' : 'Dönüş mumu henüz yok.'],
        { '1 noktası seviyesi': hedefBolge, 'Hedef (2-4 çizgisi)': p4.fiyat },
        (() => { const n = [p1, p2, p3, p4, p5].map((q, k) => nokta(m, q.i, q.fiyat, String(k + 1))); return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, p1.i, hedefBolge, ''), nokta(m, i, hedefBolge, ''), 'boyun')] }; })());
    }
    if (p1.tur === 'tepe' && p3.fiyat > p1.fiyat && p4.fiyat < p2.fiyat && p5.tur === 'tepe') {
      const hedefBolge = p1.fiyat;
      const geldi = yakin(Math.max(p5.fiyat, m[i].y), hedefBolge, 3);
      if (!geldi) return null;
      const donus = m[i].k < m[i - 1].k;
      return eslesme(s, 'qm', '1d', donus ? 'sat' : 'izle', donus ? 75 : 60,
        [`Düşüş QM: 1 noktası ${f2(p1.fiyat)}, 3 noktası ${f2(p3.fiyat)} ile 1'in üstünde, 4 noktası ${f2(p4.fiyat)} ile 2 noktasının (${f2(p2.fiyat)}) altına indi.`,
         `5 numaralı bacak 1 seviyesine (${f2(hedefBolge)}) geldi. Burası dönüş aranacak bölgedir.`,
         donus ? 'Son mum aşağı döndü.' : 'Dönüş mumu henüz yok.'],
        { '1 noktası seviyesi': hedefBolge, 'Hedef (2-4 çizgisi)': p4.fiyat },
        (() => { const n = [p1, p2, p3, p4, p5].map((q, k) => nokta(m, q.i, q.fiyat, String(k + 1))); return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, p1.i, hedefBolge, ''), nokta(m, i, hedefBolge, ''), 'boyun')] }; })());
    }
    return null;
  },
};

/** 2.11 — Wolfe: 5 pivot, üç kural, 5 noktası 1-3 çizgisinin ötesine taşıp döner. */
export const wolfe: Tarayici = {
  id: 'wolfe',
  tara(s) {
    const m = s['1d'];
    const p = pivotlar(m, 4);
    const i = m.length - 1;
    if (p.length < 5) return null;
    const [w1, w2, w3, w4, w5] = p.slice(-5);
    if (i - w5.i > 4) return null;
    const dusus = w1.tur === 'tepe' && w3.fiyat > w1.fiyat && w4.fiyat < w1.fiyat && w4.fiyat > w2.fiyat && w5.fiyat > w3.fiyat;
    const yukselis = w1.tur === 'dip' && w3.fiyat < w1.fiyat && w4.fiyat > w1.fiyat && w4.fiyat < w2.fiyat && w5.fiyat < w3.fiyat;
    if (!dusus && !yukselis) return null;
    // 1-3 kulak çizgisinin 5'teki değeri.
    const egimKulak = (w3.fiyat - w1.fiyat) / (w3.i - w1.i);
    const kulak5 = w1.fiyat + egimKulak * (w5.i - w1.i);
    const tasti = dusus ? w5.fiyat > kulak5 : w5.fiyat < kulak5;
    const geriKirdi = dusus ? m[i].k < kulak5 : m[i].k > kulak5;
    const simetri = Math.abs((w2.i - w1.i) - (w4.i - w3.i)) <= Math.max(3, (w4.i - w1.i) * 0.3);
    const guven = 50 + (tasti ? 15 : 0) + (geriKirdi ? 15 : 0) + (simetri ? 10 : 0);
    const egimHedef = (w4.fiyat - w1.fiyat) / (w4.i - w1.i);
    const hedef2 = w1.fiyat + egimHedef * (i + 10 - w1.i);
    // Çizim son mumda biter (ileriye çizilemez): 1-4 çizgisinin son mumdaki değeri, eğim bozulmasın.
    const hedefSon = w1.fiyat + egimHedef * (i - w1.i);
    return eslesme(s, 'wolfe', '1d', geriKirdi ? (dusus ? 'sat' : 'al') : 'izle', guven,
      [`${dusus ? 'Düşüş' : 'Yükseliş'} Wolfe dalgası: 1 noktası ${f2(w1.fiyat)}, 2 noktası ${f2(w2.fiyat)}, 3 noktası ${f2(w3.fiyat)}, 4 noktası ${f2(w4.fiyat)}, 5 noktası ${f2(w5.fiyat)}.`,
       `Üç kural da sağlandı: 3 noktası 1'in ${dusus ? 'üstünde' : 'altında'}, 4 noktası 1 ile 2 arasında, 5 noktası 3'ün ${dusus ? 'üstünde' : 'altında'}.`,
       tasti ? `5 noktası kulak çizgisini (${f2(kulak5)}) aştı${geriKirdi ? ' ve geri kırdı. Kural dönüş şartını bu noktada arar.' : '. Geri kırılım henüz yok.'}` : 'Kulak çizgisi aşılmadı, standart Wolfe yapısı.',
       simetri ? 'Dalgalar birbirine simetrik.' : 'Dalgaların simetrisi zayıf.'],
      { 'Hedef 1 (4 noktası)': w4.fiyat, 'Hedef 2 (1-4 çizgisi)': hedef2, 'Kulak çizgisi': kulak5 },
      (() => { const n = [w1, w2, w3, w4, w5].map((q, k) => nokta(m, q.i, q.fiyat, String(k + 1))); return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(n[0], nokta(m, w5.i, kulak5, ''), 'trend'), cizgi(n[0], nokta(m, i, hedefSon, ''), 'trend')] }; })());
  },
};

/** 2.10 — Esnek ABCD (1/C): C geri alma yüzdesi ölçülür, D bölgesi = 10000/C yüzde. */
export const abcdEsnek: Tarayici = {
  id: 'abcd-esnek',
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
    const c = Math.abs(geriAlma(A.fiyat, B.fiyat, C.fiyat));
    if (c < 0.3 || c > 0.95) return null;
    const yuzdeC = Math.round(c * 100);
    // 1/C: 1/52 = 0,0192 → yüzde 192; 1/84 = 0,0119 → yüzde 119; 1/95 = 0,0105 → yüzde 105 (ders aynı hesabı öğretir).
    const katsayi = 1 / yuzdeC;
    const hedefYuzde = esnekDYuzde(yuzdeC);
    const bc = B.fiyat - C.fiyat;
    const hedefler = [0, 1, 2, 3].map((n) => C.fiyat + bc * ((hedefYuzde + n * 100) / 100));
    const klasik = [1.272, 1.618].map((o) => C.fiyat + bc * o);
    const dYakin = hedefler.some((h) => yakin(m[i].k, h, 2.5)) || klasik.some((h) => yakin(m[i].k, h, 2.5));
    if (!dYakin) return null;
    // 1/C ölçüleri D'nin TAMAMLANMA bölgesidir (fiyat zaten orada); "Hedef" adı karneyi yüzde 0,3'lük hedefle şişiriyordu.
    // Gerçek yukarı (düşüş ABCD'de) hedef, dönüşte CD bacağının geri alımıdır. Sıfırın altına düşen bölge yazılmaz (eslesme süzer).
    const cd = C.fiyat - D.fiyat;
    const ht1 = D.fiyat + cd * 0.382;
    const ht2 = D.fiyat + cd * 0.618;
    const bolgeler = hedefler.slice(0, 2).filter((h) => h > 0);
    const yon = dususABCD ? 'al' : 'sat';
    const hp = hedefParcalari([['yüzde 38,2', ht1], ['yüzde 61,8', ht2]], yon, m[i].k);
    return eslesme(s, 'abcd-esnek', '1d', yon, 60,
      [`${dususABCD ? 'Düşüş' : 'Yükseliş'} ABCD: A noktası ${f2(A.fiyat)}, B noktası ${f2(B.fiyat)}, C noktası ${f2(C.fiyat)}.`,
       `C noktası, A ile B arasının yüzde ${yuzdeC}${belirtmeEki(yuzdeC)} geri aldı. 1 bölü ${yuzdeC} eşittir ${katsayi.toFixed(4).replace('.', ',')}, yani D bölgesi yüzde ${hedefYuzde}.`,
       `Fiyat D bölgesinde${bolgeler.length ? ` (${bolgeler.map(f2).join(' ve ')})` : ''}. Yedek D ölçüleri yüzde 127,2 için ${f2(klasik[0])}, yüzde 161,8 için ${f2(klasik[1])}.`,
       `${dususABCD ? 'Düşüş' : 'Yükseliş'} dalgası burada bitebilir. ${hp.length ? `Dönüş gelirse hedefler CD bacağının geri alımıdır: ${hp.join(', ')}.` : 'CD bacağının geri alım ölçüleri fiyata yüzde 1,5\'ten yakın kaldı.'}`],
      { 'D bölgesi 1': hedefler[0], 'D bölgesi 2': hedefler[1], 'D bölgesi (%127,2)': klasik[0], 'D bölgesi (%161,8)': klasik[1], 'Hedef 1 (CD %38,2 geri alımı)': ht1, 'Hedef 2 (CD %61,8 geri alımı)': ht2 },
      (() => { const n = [nokta(m, A.i, A.fiyat, 'A'), nokta(m, B.i, B.fiyat, 'B'), nokta(m, C.i, C.fiyat, 'C'), nokta(m, D.i, m[i].k, 'D')]; return { noktalar: n, cizgiler: bacaklar(n) }; })());
  },
};

/** 2.2 — OBO / TOBO: 5 pivot şablonu + boyun + hacim/RSI. */
export const oboTobo: Tarayici = {
  id: 'obo-tobo',
  tara(s) {
    const m = s['1d'];
    const p = pivotlar(m, 5);
    const r = rsi(kapanislar(m), 14);
    const i = m.length - 1;
    if (p.length < 5) return null;
    const [so, d1, bas, d2, sa] = p.slice(-5);
    if (i - sa.i > 10) return null;
    // TOBO: dip tepe dip(baş) tepe dip; baş en düşük, omuzlar birbirine %5 içinde.
    if (so.tur === 'dip' && bas.tur === 'dip' && sa.tur === 'dip' && bas.fiyat < so.fiyat && bas.fiyat < sa.fiyat && yakin(sa.fiyat, so.fiyat, 6)) {
      const boyun = Math.min(d1.fiyat, d2.fiyat); // en mütevazı boyun
      const yukseklik = boyun - bas.fiyat;
      const kirildi = m[i].k > boyun;
      const sagHacim = hacimOrt(m, i - bas.i, i);
      const solHacim = hacimOrt(m, bas.i - so.i, bas.i);
      const hacimIyi = sagHacim > solHacim;
      const rsiIyi = r[bas.i] > r[so.i];
      const guven = 45 + (hacimIyi ? 15 : 0) + (rsiIyi ? 15 : 0) + (kirildi ? 20 : 0);
      return eslesme(s, 'obo-tobo', '1d', kirildi ? 'al' : 'izle', guven,
        [`Ters omuz baş omuz: Sol omuz ${f2(so.fiyat)}, baş ${f2(bas.fiyat)}, sağ omuz ${f2(sa.fiyat)}, boyun çizgisi ${f2(boyun)}.`,
         hacimIyi ? 'Formasyonun sağ yarısındaki hacim sol yarısından fazla.' : 'Formasyonun sağ yarısında hacim artmadı.',
         rsiIyi ? 'Baş ile sol omuz arasında RSI pozitif uyumsuzluk gösteriyor.' : 'RSI uyumsuzluğu yok.',
         kirildi ? 'Boyun çizgisi kapanışla aşıldı.' : 'Boyun çizgisi henüz kırılmadı. Kural kapanışla kırılımı şart sayar.'],
        { Boyun: boyun, 'Hedef (boyun artı boy)': boyun + yukseklik },
        (() => { const n = [nokta(m, so.i, so.fiyat, 'SO'), nokta(m, d1.i, d1.fiyat, ''), nokta(m, bas.i, bas.fiyat, 'Baş'), nokta(m, d2.i, d2.fiyat, ''), nokta(m, sa.i, sa.fiyat, 'SA')]; return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, so.i, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
    }
    if (so.tur === 'tepe' && bas.tur === 'tepe' && sa.tur === 'tepe' && bas.fiyat > so.fiyat && bas.fiyat > sa.fiyat && yakin(sa.fiyat, so.fiyat, 6)) {
      const boyun = Math.max(d1.fiyat, d2.fiyat);
      const yukseklik = bas.fiyat - boyun;
      const kirildi = m[i].k < boyun;
      const basHacim = hacimOrt(m, 3, bas.i);
      const solHacim = hacimOrt(m, 3, so.i);
      const hacimIyi = basHacim < solHacim;
      const rsiIyi = r[bas.i] < r[so.i];
      const guven = 45 + (hacimIyi ? 15 : 0) + (rsiIyi ? 15 : 0) + (kirildi ? 20 : 0);
      return eslesme(s, 'obo-tobo', '1d', kirildi ? 'sat' : 'izle', guven,
        [`Omuz baş omuz: Sol omuz ${f2(so.fiyat)}, baş ${f2(bas.fiyat)}, sağ omuz ${f2(sa.fiyat)}, boyun çizgisi ${f2(boyun)}.`,
         hacimIyi ? 'Baştaki hacim sol omuzdakinden düşük, yükseliş iştahsız.' : 'Baştaki hacim düşmedi.',
         rsiIyi ? 'RSI negatif uyumsuzluk gösteriyor.' : 'RSI uyumsuzluğu yok.',
         kirildi ? 'Boyun çizgisi aşağı kırıldı.' : 'Boyun çizgisi henüz kırılmadı. Kural kapanışla kırılımı şart sayar.'],
        { Boyun: boyun, 'Hedef (boyun eksi boy)': boyun - yukseklik },
        (() => { const n = [nokta(m, so.i, so.fiyat, 'SO'), nokta(m, d1.i, d1.fiyat, ''), nokta(m, bas.i, bas.fiyat, 'Baş'), nokta(m, d2.i, d2.fiyat, ''), nokta(m, sa.i, sa.fiyat, 'SA')]; return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, so.i, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
    }
    return null;
  },
};

/**
 * 2.4b — Üçlü dip / üçlü tepe: beş pivot (dip tepe dip tepe dip), üç uç yüzde 3 bant
 * içinde, iki ara pivot boynu verir. Kırılım günü pivot listesinin sonuna "oluşmakta
 * olan" bir uç eklediği için son beş ve ondan önceki beş pivot ayrı ayrı denenir.
 */
export const ucluTepeDip: Tarayici = {
  id: 'uclu-tepe-dip',
  tara(s) {
    const m = s['1d'];
    const p = pivotlar(m, 4);
    const r = rsi(kapanislar(m), 14);
    const i = m.length - 1;
    const bant = (x: number, y: number, z: number) => { const ort = (x + y + z) / 3; return [x, y, z].every((v) => Math.abs(v / ort - 1) <= 0.02); };
    for (const pencere of [p.slice(-6, -1), p.slice(-5)]) {
      if (pencere.length < 5) continue;
      const [a, b, c, d, e] = pencere;
      if (i - e.i > 15 || e.i - a.i < 20) continue;
      // Son pivot "oluşmakta": üçüncü uç sayılması için fiyat ondan en az yüzde 2 uzaklaşmış olmalı; yoksa bugünkü mumun kendisidir.
      const olusuyor = e === p[p.length - 1];
      if (olusuyor && !(i - e.i >= 2 && (e.tur === 'tepe' ? m[i].k < e.fiyat * 0.98 : m[i].k > e.fiyat * 1.02))) continue;
      // Fiyat üçüncü ucu belirgin geçtiyse bu bir "üçlü" değil, kırılımdır (oluşmakta olan pivot yanıltır).
      if (a.tur === 'dip' && c.tur === 'dip' && e.tur === 'dip' && bant(a.fiyat, c.fiyat, e.fiyat) && m[i].d >= Math.min(a.fiyat, c.fiyat, e.fiyat) * 0.99) {
        const boyun = Math.max(b.fiyat, d.fiyat);
        const taban = Math.min(a.fiyat, c.fiyat, e.fiyat);
        const kirildi = m[i].k > boyun;
        const hacimArtti = hacimOrt(m, 3, Math.min(e.i + 1, i)) > hacimOrt(m, 3, a.i + 1);
        const rsiIyi = r[e.i] > r[a.i];
        const guven = 50 + (hacimArtti ? 10 : 0) + (rsiIyi ? 15 : 0) + (kirildi ? 20 : 0);
        return eslesme(s, 'uclu-tepe-dip', '1d', kirildi ? 'al' : 'izle', guven,
          [`Üçlü dip: üç dip ${f2(a.fiyat)}, ${f2(c.fiyat)} ve ${f2(e.fiyat)} seviyelerinde, ortalamadan sapma yüzde 2'nin altında. Aynı yerden üç kez dönüş: O bölgede alıcı var.`,
           `Boyun çizgisi iki ara tepenin yükseği, ${f2(boyun)}. Formasyon boyu ${f2(boyun - taban)}.`,
           rsiIyi ? 'RSI üçüncü dipte ilk dipten yüksek: Satış gücü azalıyor.' : 'RSI uyumsuzluğu yok.',
           kirildi ? 'Boyun çizgisi kapanışla aşıldı; yükseliş şartı sağlandı.' : 'Boyun çizgisi henüz kırılmadı; kural, üçüncü dipten dönüşü tek başına yeterli saymaz.'],
          { Boyun: boyun, 'Hedef (bir boy)': boyun + (boyun - taban), 'Hedef (iki boy)': boyun + 2 * (boyun - taban), 'Stop (üçüncü dip)': e.fiyat },
          (() => { const n = [a, b, c, d, e].map((q, k) => nokta(m, q.i, q.fiyat, k % 2 === 0 ? String(k / 2 + 1) : '')); return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, a.i, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
      }
      if (a.tur === 'tepe' && c.tur === 'tepe' && e.tur === 'tepe' && bant(a.fiyat, c.fiyat, e.fiyat) && m[i].y <= Math.max(a.fiyat, c.fiyat, e.fiyat) * 1.01) {
        const boyun = Math.min(b.fiyat, d.fiyat);
        const tavan = Math.max(a.fiyat, c.fiyat, e.fiyat);
        const kirildi = m[i].k < boyun;
        const hacimDustu = hacimOrt(m, 3, Math.min(e.i, i)) < hacimOrt(m, 3, a.i);
        const rsiIyi = r[e.i] < r[a.i];
        const guven = 50 + (hacimDustu ? 10 : 0) + (rsiIyi ? 15 : 0) + (kirildi ? 20 : 0);
        return eslesme(s, 'uclu-tepe-dip', '1d', kirildi ? 'sat' : 'izle', guven,
          [`Üçlü tepe: üç tepe ${f2(a.fiyat)}, ${f2(c.fiyat)} ve ${f2(e.fiyat)} seviyelerinde, ortalamadan sapma yüzde 2'nin altında. Aynı yerden üç kez geri çevrildi: Orada satıcı var.`,
           `Boyun çizgisi iki ara dibin alçağı, ${f2(boyun)}. Formasyon boyu ${f2(tavan - boyun)}.`,
           rsiIyi ? 'RSI üçüncü tepede ilk tepeden düşük: Alış gücü azalıyor.' : 'RSI uyumsuzluğu yok.',
           kirildi ? 'Boyun çizgisi aşağı kırıldı; düşüş şartı sağlandı. Kural kitabında bu kırılım çıkış seviyesi sayılır.' : 'Boyun çizgisi henüz kırılmadı; kural, üçüncü tepeyi tek başına yeterli saymaz.'],
          { Boyun: boyun, 'Hedef (bir boy aşağı)': boyun - (tavan - boyun), 'Hedef (iki boy aşağı)': boyun - 2 * (tavan - boyun), 'Stop (üçüncü tepe)': e.fiyat },
          (() => { const n = [a, b, c, d, e].map((q, k) => nokta(m, q.i, q.fiyat, k % 2 === 0 ? String(k / 2 + 1) : '')); return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(nokta(m, a.i, boyun, ''), nokta(m, i, boyun, ''), 'boyun')] }; })());
      }
    }
    return null;
  },
};
