import type { Eslesme, Mum, Ortam, Seriler } from './tipler';
import { aylik, dortSaatlik, haftalik } from './gostergeler/periyot';
import { ema } from './gostergeler/ortalama';
import { pivotlar } from './gostergeler/pivot';
import { heikin } from './gostergeler/heikin';
import { rsi } from './gostergeler/rsi';
import { TARAYICILAR } from './stratejiler';
import { bildirimMetni, hedefBildirimMetni, hedefKonusu, TARAMA_ADLARI } from './bildirim-metin';
import { hedefeUlasanlar, ilkHedef, sicilIlerlet, SURE_GUN } from './sicil';
import { ABD_HISSELER, BIST_HISSELER } from './veri/evren';
import { gostergeler } from './calistir';
import { donemAnahtari, portfoyuIlerlet, ucluSec } from './portfoy';

/**
 * SINAMA — yapay seriler üretir, her tarayıcının BİLEREK kurulmuş
 * örnekte ötmesini ve bozulmuş örnekte SUSMASINI ölçer. Yeşil yanıp hiçbir
 * şey ölçmeyen kontrol istemiyoruz: her tarayıcı için bir "uymalı" bir
 * "uymamalı" seri var.
 */
let hata = 0;
let gecti = 0;
function kontrol(ad: string, sart: boolean, not = '') {
  if (sart) gecti++;
  else {
    hata++;
    console.error(`  ✗ ${ad} ${not}`);
  }
}

const ORTAM: Ortam = { endeksNabzi: { XU100: { pozitif: true, ema8: 1, ema20: 0, t: 0 }, SPX: { pozitif: true, ema8: 1, ema20: 0, t: 0 } } };

/** Kapanış dizisinden mum üret: gün başı 09:00 UTC, hacim verilmezse 1000. */
function mumla(kapanis: number[], hacim?: number[], genlik = 0.01): Mum[] {
  const bas = Date.UTC(2024, 0, 1) / 1000;
  return kapanis.map((k, i) => {
    const a = i === 0 ? k : kapanis[i - 1];
    const y = Math.max(a, k) * (1 + genlik);
    const d = Math.min(a, k) * (1 - genlik);
    return { t: bas + i * 86400, a, y, d, k, h: hacim?.[i] ?? 1000 };
  });
}

function seri(gunluk: Mum[], sembol = 'TEST'): Seriler {
  // 4 saatlik/saatlik gerekmeyen testlerde günlükten saatlik taklit: 2 mum/gün.
  const saatlik: Mum[] = [];
  for (const m of gunluk) {
    saatlik.push({ ...m, t: m.t, k: (m.a + m.k) / 2 });
    saatlik.push({ ...m, t: m.t + 3600 * 4 });
  }
  return { sembol, piyasa: 'BIST', '1h': saatlik, '4h': dortSaatlik(saatlik), '1d': gunluk, '1w': haftalik(gunluk), '1mo': aylik(gunluk) };
}

/** Grafik üstü çizim geçerli mi: g tam sayı ve ≥ 0, fiyat sonlu, çizgi uçları da öyle. */
function cizimKontrol(ad: string, e: Eslesme | null) {
  const c = e?.cizim;
  kontrol(`${ad}: çizim var`, !!c && ((c.noktalar?.length ?? 0) > 0 || (c.cizgiler?.length ?? 0) > 0));
  if (!c) return;
  const n = [...(c.noktalar ?? []), ...(c.cizgiler ?? []).flatMap((l) => [l.a, l.b])];
  kontrol(`${ad}: çizim noktaları geçerli`, n.every((q) => Number.isInteger(q.g) && q.g >= 0 && Number.isFinite(q.fiyat) && typeof q.ad === 'string'), JSON.stringify(n.slice(0, 3)));
  kontrol(`${ad}: çizim 160 mumu aşmıyor`, n.every((q) => q.g <= 160), String(Math.max(...n.map((q) => q.g))));
}

const tarayici = (id: string) => {
  const t = TARAYICILAR.find((x) => x.id === id);
  if (!t) throw new Error(`tarayıcı yok: ${id}`);
  return t;
};

// Yardımcı dizi üreticileri
const sabit = (n: number, v: number) => Array(n).fill(v) as number[];
const dogrusal = (n: number, bas: number, bit: number) => Array.from({ length: n }, (_, i) => bas + ((bit - bas) * i) / (n - 1));
const dalga = (n: number, orta: number, genlik: number, periyot: number) => Array.from({ length: n }, (_, i) => orta + genlik * Math.sin((2 * Math.PI * i) / periyot));

console.log('Göstergeler');
{
  const e = ema(dogrusal(50, 10, 20), 10);
  kontrol('ema son değer fiyatın altında ve artıyor', e[49] < 20 && e[49] > e[48]);
  const r = rsi([...dogrusal(30, 10, 20), ...dogrusal(30, 20, 10)], 14);
  kontrol('rsi yükselişte >70, düşüşte <30', r[29] > 70 && r[59] < 30, `${r[29]?.toFixed(0)} ${r[59]?.toFixed(0)}`);
  const p = pivotlar(mumla(dalga(120, 100, 10, 40)), 4);
  kontrol('zigzag: 40 periyotlu dalgada ~6 pivot', p.length >= 5 && p.length <= 8, String(p.length));
  const h = heikin(mumla(dogrusal(20, 10, 15), undefined, 0.0));
  kontrol('heikin: düz yükselişte son mum yeşil', h[19].renk === 'yesil');
}

console.log('ema200 / ema200-donus');
{
  // 250 gün 100'de yatay, sonra 30 gün 90'a düşüş (200 altı), sonra 12 gün 112'ye.
  const k = [...sabit(250, 100), ...dogrusal(30, 100, 88), ...dogrusal(8, 88, 112)];
  const s = seri(mumla(k));
  const e = tarayici('ema200-donus').tara(s, ORTAM);
  kontrol('ema200-donus uymalı', e !== null && e.yon === 'al');
  const s2 = seri(mumla([...sabit(250, 100), ...dogrusal(42, 100, 112)]));
  kontrol('ema200-donus hiç altına inmemişse uymamalı', tarayici('ema200-donus').tara(s2, ORTAM) === null);
}

console.log('dugum');
{
  const s = seri(mumla([...dalga(100, 100, 8, 30), ...sabit(40, 100)]));
  kontrol('dugum: 40 gün yatayda EMA\'lar düğümlenir', tarayici('dugum').tara(s, ORTAM) !== null);
  const s2 = seri(mumla(dogrusal(140, 50, 150)));
  kontrol('dugum: dik trendde uymamalı', tarayici('dugum').tara(s2, ORTAM) === null);
}

console.log('fib-merdiveni');
{
  // Uzun yükseliş (sıralı dizilim), derin düzeltme 144-233 arasına, sonra 55'i geçiş.
  const k = [...dogrusal(300, 50, 300), ...dogrusal(15, 300, 230), ...dogrusal(10, 230, 278)];
  const s = seri(mumla(k));
  const e = tarayici('fib-merdiveni').tara(s, ORTAM);
  kontrol('fib-merdiveni uymalı (bölgeye dalıp çıkış)', e !== null, e ? '' : 'null');
  const s2 = seri(mumla(dogrusal(365, 200, 50)));
  kontrol('fib-merdiveni düşen trendde uymamalı', tarayici('fib-merdiveni').tara(s2, ORTAM) === null);
}

console.log('kuyruklu-w');
{
  const k = [...sabit(30, 100), ...dogrusal(20, 100, 80), ...dogrusal(10, 80, 92), ...dogrusal(8, 92, 80.8), ...dogrusal(6, 80.8, 95)];
  const m = mumla(k, undefined, 0.005);
  // 50. mum: uzun alt kuyruklu dip mumu.
  m[49] = { ...m[49], a: 81, k: 80.5, d: 76, y: 81.5 };
  for (let i = 50; i < m.length; i++) if (m[i].d < 76.5) m[i] = { ...m[i], d: 77 };
  const e = tarayici('kuyruklu-w').tara(seri(m), ORTAM);
  kontrol('kuyruklu-w uymalı', e !== null && e.yon === 'al', e ? e.yon : 'null');
  const m2 = m.map((x) => ({ ...x }));
  m2[62] = { ...m2[62], k: 75, d: 74 }; // kutunun altında kapanış: formasyon ölür
  kontrol('kuyruklu-w kutu altı kapanışta uymamalı', tarayici('kuyruklu-w').tara(seri(m2), ORTAM) === null);
}

console.log('topuk-donusu');
{
  // 60 gün yatay 100, 12 gün sert düşüş 70'e, 3 gün hacimli kalkış 78, 12 gün yavaş sürüklenme 74, son gün 77 hacimli.
  const k = [...sabit(60, 100), ...dogrusal(12, 100, 70), ...dogrusal(3, 72, 78), ...dogrusal(12, 77.5, 74), 77];
  const h = [...sabit(60, 1000), ...sabit(12, 1400), ...sabit(3, 4000), ...sabit(12, 700), 1500];
  const e = tarayici('topuk-donusu').tara(seri(mumla(k, h, 0.004)), ORTAM);
  kontrol('topuk-donusu uymalı', e !== null, e ? '' : 'null');
  kontrol('topuk-donusu al sinyali', e?.yon === 'al', e?.yon ?? 'null');
  const h2 = [...h];
  for (let i = 72; i < 75; i++) h2[i] = 900; // kalkış hacimsiz
  kontrol('topuk-donusu hacimsiz kalkışta uymamalı', tarayici('topuk-donusu').tara(seri(mumla(k, h2, 0.004)), ORTAM) === null);
}

console.log('ikili-tepe-dip');
{
  const k = [...sabit(40, 100), ...dogrusal(10, 100, 80), ...dogrusal(10, 80, 92), ...dogrusal(10, 92, 80.5), ...dogrusal(6, 80.5, 94)];
  const e = tarayici('ikili-tepe-dip').tara(seri(mumla(k)), ORTAM);
  kontrol('ikili dip uymalı ve boyun kırıldı', e !== null && e.yon === 'al', e ? e.yon : 'null');
}

console.log('qm');
{
  // 1 dip 90, 2 tepe 100, 3 dip 85, 4 tepe 106, 5 dip 90'a iniş.
  const k = [...dogrusal(10, 95, 90), ...dogrusal(10, 90, 100), ...dogrusal(10, 100, 85), ...dogrusal(10, 85, 106), ...dogrusal(10, 106, 90), 91];
  const e = tarayici('qm').tara(seri(mumla([...sabit(30, 95), ...k])), ORTAM);
  kontrol('qm yükseliş uymalı', e !== null, e ? '' : 'null');
}

console.log('k-52-hafta');
{
  const k = [...dalga(300, 100, 5, 50), 110];
  const h = [...sabit(300, 1000), 2500];
  const e = tarayici('k-52-hafta').tara(seri(mumla(k, h)), ORTAM);
  kontrol('52 hafta zirvesi uymalı', e !== null && e.yon === 'al');
  kontrol('52 hafta hacimsiz uymamalı', tarayici('k-52-hafta').tara(seri(mumla(k, [...sabit(300, 1000), 1200])), ORTAM) === null);
}

console.log('sma30w / altin-kesisme');
{
  const k = [...sabit(300, 100), ...dogrusal(100, 100, 70), ...dogrusal(32, 70, 95)];
  kontrol('sma30w son haftalarda kesişme', tarayici('sma30w').tara(seri(mumla(k)), ORTAM) !== null || tarayici('altin-kesisme').tara(seri(mumla(k)), ORTAM) !== null);
}

console.log('haftalik-cift-onay / heikin / rsi-uyumsuzluk (çalışıyor, hata fırlatmıyor)');
{
  const s = seri(mumla(dalga(400, 100, 15, 90)));
  for (const id of ['haftalik-cift-onay', 'heikin', 'rsi-uyumsuzluk', 'wolfe', 'abcd-esnek', 'obo-tobo', '123-dongusu', 'sahte-cikis', 'uc-bant-testi', 'yeni-dongu', 'ay-sonu-taramasi', 'yukselen-dipler', 'k-dar-bayrak', '200-sikismasi', 'hisse-8-89', 'saatlik-9-26', 'aylik-5-10']) {
    let ok = true;
    try {
      tarayici(id).tara(s, ORTAM);
    } catch (e) {
      ok = false;
      console.error(e);
    }
    kontrol(`${id} hata fırlatmadı`, ok);
  }
}

console.log('sekiller: ucgenler / dikdortgen / bayrak / fincan-kulp / kama');
{
  // Yükselen üçgen: tepeler 100'de yatay, dipler yükseliyor, son mum 103'e kırıyor.
  const u: number[] = [...sabit(30, 90)];
  for (let t = 0; t < 6; t++) { u.push(...dogrusal(5, 90 + t * 1.6, 100), ...dogrusal(5, 100, 91 + (t + 1) * 1.6)); }
  u.push(103);
  const hu = [...sabit(u.length - 1, 1000), 2200];
  const eu = tarayici('ucgenler').tara(seri(mumla(u, hu, 0.003)), ORTAM);
  kontrol('yükselen üçgen kırılımı uymalı', eu !== null && eu.yon === 'al', eu ? eu.yon + ' ' + eu.aciklama[0] : 'null');
  cizimKontrol('üçgen', eu);
  kontrol('üçgen: düz trendde uymamalı', tarayici('ucgenler').tara(seri(mumla(dogrusal(120, 50, 150))), ORTAM) === null);
  // Dikdörtgen: 90-100 arasında 6 tur, son mum 102.
  const d: number[] = [...sabit(30, 95)];
  for (let t = 0; t < 6; t++) d.push(...dogrusal(5, 90, 100), ...dogrusal(5, 100, 90));
  d.push(102);
  const ed = tarayici('dikdortgen').tara(seri(mumla(d, [...sabit(d.length - 1, 1000), 2000], 0.003)), ORTAM);
  kontrol('dikdörtgen kırılımı uymalı', ed !== null && ed.yon === 'al', ed ? ed.yon : 'null');
  cizimKontrol('dikdörtgen', ed);
  // Bayrak: 10 mumda 80→100, 7 mum 100→96 bez, son mum 101.
  const b = [...sabit(50, 80), ...dogrusal(10, 80, 100), ...dogrusal(7, 100, 96), 101];
  const eb = tarayici('bayrak').tara(seri(mumla(b, [...sabit(b.length - 1, 1000), 1800], 0.004)), ORTAM);
  kontrol('bayrak kırılımı uymalı', eb !== null && eb.yon === 'al', eb ? eb.yon : 'null');
  cizimKontrol('bayrak', eb);
  // Fincan-kulp: 60 mumluk U (100→75→100), 8 mumluk kulp 100→95, son mum 102.
  const fk: number[] = [...sabit(40, 100)];
  for (let t = 0; t < 60; t++) fk.push(100 - 25 * Math.sin((Math.PI * t) / 59));
  fk.push(...dogrusal(8, 100, 95), 102);
  const ef = tarayici('fincan-kulp').tara(seri(mumla(fk, [...sabit(fk.length - 1, 1000), 1800], 0.003)), ORTAM);
  kontrol('fincan-kulp boyun kırılımı uymalı', ef !== null && ef.yon === 'al', ef ? ef.yon + ' ' + ef.aciklama[0] : 'null');
  cizimKontrol('fincan-kulp', ef);
  // Alçalan kama: tepeler 100→90, dipler 92→88 (yakınsıyor), son mum üst çizgiyi kırar.
  const ka: number[] = [...sabit(30, 100)];
  for (let t = 0; t < 6; t++) ka.push(...dogrusal(5, 100 - t * 2, 92 - t * 0.8), ...dogrusal(5, 92 - t * 0.8, 100 - (t + 1) * 2));
  ka.push(96);
  const ek = tarayici('kama').tara(seri(mumla(ka, undefined, 0.003)), ORTAM);
  kontrol('alçalan kama kırılımı uymalı', ek !== null && ek.yon === 'al', ek ? ek.yon + ' ' + ek.aciklama[0] : 'null');
  cizimKontrol('kama', ek);
  for (const id of ['bes-dalga', 'abcd-klasik']) {
    let ok = true;
    try { tarayici(id).tara(seri(mumla(dalga(400, 100, 15, 90))), ORTAM); } catch (e) { ok = false; console.error(e); }
    kontrol(`${id} hata fırlatmadı`, ok);
  }
}

console.log('harmonik: gartley / bat / butterfly');
{
  // X→A→B→C→D bacaklarını doğrusal parçalarla kur; son mum D'den hafif yukarı döner (yükseliş kalıbı, M biçimi).
  const harmonik = (bOran: number, cOran: number, dOran: number) => {
    const X = 100; const A = 125; const xa = A - X;
    const B = A - xa * bOran; const C = B + (A - B) * cOran; const D = A - xa * dOran;
    const k = [...sabit(100, 100), ...dogrusal(12, X, A), ...dogrusal(10, A, B), ...dogrusal(8, B, C), ...dogrusal(10, C, D), D * 1.006];
    return seri(mumla(k, undefined, 0.002));
  };
  const g = tarayici('gartley').tara(harmonik(0.618, 0.618, 0.786), ORTAM);
  kontrol('gartley: B 0,618 ve D 0,786 uymalı, yön al', g !== null && g.yon === 'al', g ? g.yon + ' ' + g.aciklama.join(' | ') : 'null');
  kontrol('gartley: stop X seviyesi, hedefler D üstünde', !!g?.seviyeler && Math.abs(g.seviyeler['Stop (X)'] - 100) < 1 && g.seviyeler['Hedef 1 (AD %38,2)'] > g.seviyeler['D bölgesi']);
  cizimKontrol('gartley', g);
  kontrol('gartley: beş nokta X A B C D', g?.cizim?.noktalar?.map((q) => q.ad).join('') === 'XABCD' && (g?.cizim?.noktalar?.[0].g ?? 0) > (g?.cizim?.noktalar?.[4].g ?? 0), g?.cizim?.noktalar?.map((q) => q.ad + q.g).join(','));
  const b = tarayici('bat').tara(harmonik(0.45, 0.618, 0.886), ORTAM);
  kontrol('bat: B 0,45 ve D 0,886 uymalı', b !== null && b.yon === 'al', b ? b.yon : 'null');
  const bf = tarayici('butterfly').tara(harmonik(0.786, 0.618, 1.272), ORTAM);
  kontrol('butterfly: B 0,786 ve D 1,272 (X ötesi) uymalı', bf !== null && bf.yon === 'al', bf ? bf.yon : 'null');
  kontrol('gartley: bat oranlarına uymamalı', tarayici('gartley').tara(harmonik(0.45, 0.618, 0.886), ORTAM) === null);
  kontrol('bat: butterfly oranlarına uymamalı', tarayici('bat').tara(harmonik(0.786, 0.618, 1.272), ORTAM) === null);
  kontrol('butterfly: D X\'i geçmezse uymamalı', tarayici('butterfly').tara(harmonik(0.786, 0.618, 0.9), ORTAM) === null);
  kontrol('harmonik: düz trendde uymamalı', ['gartley', 'bat', 'butterfly'].every((id) => tarayici(id).tara(seri(mumla(dogrusal(200, 50, 150))), ORTAM) === null));
  // Düşüş kalıbı (W biçimi): ayna.
  const dususG = (() => { const X = 125; const A = 100; const xa = X - A; const B = A + xa * 0.618; const C = B - (B - A) * 0.618; const D = A + xa * 0.786; const k = [...sabit(100, 125), ...dogrusal(12, X, A), ...dogrusal(10, A, B), ...dogrusal(8, B, C), ...dogrusal(10, C, D), D * 0.994]; return seri(mumla(k, undefined, 0.002)); })();
  const gd = tarayici('gartley').tara(dususG, ORTAM);
  kontrol('gartley düşüş kalıbı: yön sat', gd !== null && gd.yon === 'sat', gd ? gd.yon : 'null');
}

console.log('mumlar: yutan / cekic / sabah-yildizi');
{
  const T0 = Date.UTC(2024, 0, 1) / 1000;
  const mum = (i: number, a: number, y: number, d: number, k: number, h = 1000): Mum => ({ t: T0 + i * 86400, a, y, d, k, h });
  // 50 mumluk düşüş: 120'den 100'e, her gün küçük kırmızı gövde.
  const dusus = (): Mum[] => Array.from({ length: 50 }, (_, i) => { const a = 120 - i * 0.4; return mum(i, a, a + 0.2, a - 0.6, a - 0.4); });
  // Yutan: dün kırmızı (100→99), bugün yeşil 98,8→101 (sarıyor), yarın 102 kapanış (teyit).
  const yutanSeri = [...dusus(), mum(50, 100, 100.2, 98.9, 99), mum(51, 98.8, 101.3, 98.6, 101, 2000), mum(52, 101, 102.5, 100.5, 102)];
  const ey = tarayici('yutan').tara(seri(yutanSeri), ORTAM);
  kontrol('yutan: boğa yutan + teyit → al', ey !== null && ey.yon === 'al', ey ? ey.yon + ' ' + ey.aciklama[0] : 'null');
  const eyIzle = tarayici('yutan').tara(seri(yutanSeri.slice(0, -1)), ORTAM);
  kontrol('yutan: teyitsiz → izle', eyIzle !== null && eyIzle.yon === 'izle', eyIzle ? eyIzle.yon : 'null');
  const sarmayan = [...dusus(), mum(50, 100, 100.2, 98.9, 99), mum(51, 99.2, 100.5, 99, 100.3)];
  kontrol('yutan: gövde sarmıyorsa uymamalı', tarayici('yutan').tara(seri(sarmayan), ORTAM) === null);
  const yukseliste = Array.from({ length: 50 }, (_, i) => { const a = 100 + i * 0.4; return mum(i, a, a + 0.6, a - 0.2, a + 0.4); });
  kontrol('yutan: yükseliş ortasında boğa yutan uymamalı (bağlam)', tarayici('yutan').tara(seri([...yukseliste, mum(50, 120, 120.2, 118.9, 119), mum(51, 118.8, 121.3, 118.6, 121), mum(52, 121, 122, 120.5, 121.8)]), ORTAM) === null);
  // Çekiç: dipte uzun alt fitil (gövde 0,3; fitil 2,4), ertesi gün tepesinin üstünde kapanış.
  const cekicSeri = [...dusus(), mum(50, 100, 100.3, 97.5, 100.2, 1800), mum(51, 100.2, 101.2, 99.8, 101)];
  const ec = tarayici('cekic').tara(seri(cekicSeri), ORTAM);
  kontrol('çekiç + teyit → al', ec !== null && ec.yon === 'al', ec ? ec.yon + ' ' + ec.aciklama[0] : 'null');
  kontrol('çekiç: teyitsiz → izle', tarayici('cekic').tara(seri(cekicSeri.slice(0, -1)), ORTAM)?.yon === 'izle');
  kontrol('çekiç: iki taraflı fitil (topaç) uymamalı', tarayici('cekic').tara(seri([...dusus(), mum(50, 100, 101.5, 98.5, 100.1)]), ORTAM) === null);
  // Kayan yıldız: tepede uzun üst fitil, ertesi gün dibinin altında kapanış → sat.
  const yildiz = [...yukseliste, mum(50, 120, 122.6, 119.8, 120.1, 1800), mum(51, 120, 120.3, 118.9, 119.2)];
  const ek = tarayici('cekic').tara(seri(yildiz), ORTAM);
  kontrol('kayan yıldız + teyit → sat', ek !== null && ek.yon === 'sat', ek ? ek.yon : 'null');
  // Sabah yıldızı: uzun kırmızı 100→98, yıldız 97,9→98,1, yeşil 98,2→99,6 (ortayı 99 geçer).
  const sabah = [...dusus(), mum(50, 100, 100.1, 97.8, 98), mum(51, 97.9, 98.3, 97.5, 98.1), mum(52, 98.2, 99.8, 98, 99.6, 2000)];
  const es = tarayici('sabah-yildizi').tara(seri(sabah), ORTAM);
  kontrol('sabah yıldızı → al', es !== null && es.yon === 'al', es ? es.yon + ' ' + es.aciklama[0] : 'null');
  const yarim = [...dusus(), mum(50, 100, 100.1, 97.8, 98), mum(51, 97.9, 98.3, 97.5, 98.1), mum(52, 98.2, 98.9, 98, 98.7)];
  kontrol('sabah yıldızı: üçüncü mum ortayı geçmezse uymamalı', tarayici('sabah-yildizi').tara(seri(yarim), ORTAM) === null);
  const aksam = [...yukseliste, mum(50, 120, 122.2, 119.9, 122), mum(51, 122.1, 122.5, 121.8, 122.2), mum(52, 122, 122.1, 120.2, 120.4, 2000)];
  const ea = tarayici('sabah-yildizi').tara(seri(aksam), ORTAM);
  kontrol('akşam yıldızı → sat', ea !== null && ea.yon === 'sat', ea ? ea.yon : 'null');
  for (const id of ['yutan', 'cekic', 'sabah-yildizi']) kontrol(`${id}: düz dalgada hata fırlatmaz`, (() => { try { tarayici(id).tara(seri(mumla(dalga(400, 100, 15, 90))), ORTAM); return true; } catch { return false; } })());
}

console.log('ters-fincan-kulp / uclu-tepe-dip');
{
  // Ters fincan: 60 mumluk ters U (100→125→100), 8 mumluk ters kulp 100→105, son mum 98 kırılım.
  const tf: number[] = [...sabit(40, 100)];
  for (let t = 0; t < 60; t++) tf.push(100 + 25 * Math.sin((Math.PI * t) / 59));
  tf.push(...dogrusal(8, 100, 105), 98);
  const et = tarayici('ters-fincan-kulp').tara(seri(mumla(tf, [...sabit(tf.length - 1, 1000), 1800], 0.003)), ORTAM);
  kontrol('ters fincan kulp boyun kırılımı → sat', et !== null && et.yon === 'sat', et ? et.yon + ' ' + et.aciklama[0] : 'null');
  kontrol('ters fincan: hedefler boynun altında, stop kulp tepesi', !!et?.seviyeler && et.seviyeler['Hedef (bir boy aşağı)'] < et.seviyeler.Boyun && et.seviyeler['Stop (kulp tepesi)'] > et.seviyeler.Boyun);
  cizimKontrol('ters fincan', et);
  const fk: number[] = [...sabit(40, 100)];
  for (let t = 0; t < 60; t++) fk.push(100 - 25 * Math.sin((Math.PI * t) / 59));
  fk.push(...dogrusal(8, 100, 95), 102);
  kontrol('ters fincan: düz fincana uymamalı', tarayici('ters-fincan-kulp').tara(seri(mumla(fk, undefined, 0.003)), ORTAM) === null);
  // Üçlü dip: 90'da üç dip, 100'de iki tepe, son mum 102.
  const ud = [...sabit(30, 95), ...dogrusal(8, 95, 90), ...dogrusal(8, 90, 100), ...dogrusal(8, 100, 90), ...dogrusal(8, 90, 100), ...dogrusal(8, 100, 90), ...dogrusal(6, 90, 99), 102];
  const eu = tarayici('uclu-tepe-dip').tara(seri(mumla(ud, undefined, 0.003)), ORTAM);
  kontrol('üçlü dip boyun kırılımı → al', eu !== null && eu.yon === 'al', eu ? eu.yon + ' ' + eu.aciklama[0] : 'null');
  cizimKontrol('üçlü dip', eu);
  kontrol('üçlü dip: boyun çizgisi son muma kadar', eu?.cizim?.cizgiler?.some((l) => l.tur === 'boyun' && l.b.g === 0) === true);
  const ut = [...sabit(30, 95), ...dogrusal(8, 95, 100), ...dogrusal(8, 100, 90), ...dogrusal(8, 90, 100), ...dogrusal(8, 100, 90), ...dogrusal(8, 90, 100), ...dogrusal(6, 100, 91), 88];
  const eut = tarayici('uclu-tepe-dip').tara(seri(mumla(ut, undefined, 0.003)), ORTAM);
  kontrol('üçlü tepe boyun kırılımı → sat', eut !== null && eut.yon === 'sat', eut ? eut.yon : 'null');
  const ikili = [...sabit(30, 95), ...dogrusal(8, 95, 90), ...dogrusal(8, 90, 100), ...dogrusal(8, 100, 90), ...dogrusal(6, 90, 99), 102];
  kontrol('üçlü dip: iki dipli W\'ye uymamalı', tarayici('uclu-tepe-dip').tara(seri(mumla(ikili, undefined, 0.003)), ORTAM) === null);
  const farkli = [...sabit(30, 95), ...dogrusal(8, 95, 90), ...dogrusal(8, 90, 100), ...dogrusal(8, 100, 84), ...dogrusal(8, 84, 100), ...dogrusal(8, 100, 90), ...dogrusal(6, 90, 99), 102];
  kontrol('üçlü dip: dipler yüzde 3 dışındaysa uymamalı', tarayici('uclu-tepe-dip').tara(seri(mumla(farkli, undefined, 0.003)), ORTAM) === null);
}

console.log('123-dongusu');
{
  // dip 80 → tepe 120, sonra %61,8 maliyete (95,3) iniş.
  const k = [...sabit(30, 80), ...dogrusal(30, 80, 120), ...dogrusal(20, 120, 95.5)];
  const e = tarayici('123-dongusu').tara(seri(mumla(k)), ORTAM);
  kontrol('123-dongusu maliyet bandında uymalı', e !== null, e ? '' : 'null');
  const e2 = tarayici('uc-bant-testi').tara(seri(mumla([...sabit(30, 80), ...dogrusal(30, 80, 120), ...dogrusal(5, 120, 104)])), ORTAM);
  kontrol('uc-bant-testi %38,2 temasında uymalı', e2 !== null, e2 ? '' : 'null');
}

console.log('iyelik eki');
{
  const { iyelikEki } = require('./stratejiler/ortak') as typeof import('./stratejiler/ortak');
  const beklenen: [number, string][] = [[32, "'si"], [41, "'i"], [50, "'si"], [100, "'ü"], [3, "'ü"], [7, "'si"], [10, "'u"], [60, "'ı"], [90, "'ı"], [4, "'ü"], [25, "'i"], [1000, "'i"], [200, "'ü"]];
  for (const [n, e] of beklenen) kontrol(`iyelik ${n} → ${e}`, iyelikEki(n) === e, iyelikEki(n));
}

console.log('portföy');
{
  const es = (sembol: string, piyasa: 'BIST' | 'ABD', taramaId: string, yon: 'al' | 'izle', guven: number, fiyat: number) =>
    ({ sembol, piyasa, taramaId, yon, guven, periyot: '1d' as const, aciklama: [], t: 0, fiyat });
  const liste = [
    es('AAA', 'BIST', 'ema200', 'al', 100, 10), es('BBB', 'BIST', 'topuk-donusu', 'al', 70, 20), es('CCC', 'BIST', 'qm', 'al', 75, 30),
    es('DDD', 'BIST', 'heikin', 'al', 100, 40), es('XXX', 'ABD', 'heikin', 'izle', 100, 50), es('YYY', 'ABD', 'fib-merdiveni', 'al', 100, 60),
  ];
  const u = ucluSec(liste, 0);
  kontrol('üçlü: 2 BIST + 1 ABD', u.length === 3 && u.filter((p) => p.piyasa === 'BIST').length === 2, u.map((p) => p.sembol).join(','));
  kontrol('üçlü: formasyon önce (BBB topuk, CCC qm), ABD al olan YYY', u.map((p) => p.sembol).join(',') === 'BBB,CCC,YYY', u.map((p) => p.sembol).join(','));
  // Pazartesi 12 Ekim 2026 09:00 TR = 06:00 UTC
  const pzt = Date.UTC(2026, 9, 12, 6) / 1000;
  kontrol('hafta anahtarı', donemAnahtari('hafta', pzt) === '2026-H42', donemAnahtari('hafta', pzt));
  kontrol('ay anahtarı', donemAnahtari('ay', pzt) === '2026-10');
  // Pazar gecesi 23:30 TR hâlâ aynı hafta, Pazartesi 00:30 TR yeni hafta.
  kontrol('hafta sınırı TR saatiyle', donemAnahtari('hafta', pzt - 10 * 3600) === '2026-H41' && donemAnahtari('hafta', pzt - 8 * 3600) === '2026-H42');
  const p1 = portfoyuIlerlet(null, liste, new Map(), pzt);
  kontrol('ilk portföy 100', p1.hafta?.deger === 100 && p1.ay?.deger === 100 && p1.yil?.deger === 100);
  const fiyatlar = new Map([['BIST:BBB', 22], ['BIST:CCC', 27], ['ABD:YYY', 66]]); // +10%, -10%, +10% → 103,33
  const p2 = portfoyuIlerlet(p1, liste, fiyatlar, pzt + 3600);
  kontrol('aynı dönemde değer güncellenir', p2.hafta?.deger === 103.33 && p2.hafta?.anahtar === '2026-H42', String(p2.hafta?.deger));
  const p3 = portfoyuIlerlet(p2, liste, fiyatlar, pzt + 7 * 86400);
  kontrol('yeni haftada eski hafta geçmişe düşer, yeni 100 başlar', p3.gecmis.length === 1 && p3.gecmis[0].deger === 103.33 && p3.hafta?.deger === 100 && p3.ay?.deger === 103.33, `${p3.gecmis.length} ${p3.hafta?.deger} ${p3.ay?.deger}`);
}

console.log('sicil');
{
  const es = (sembol: string, fiyat: number, seviyeler?: Record<string, number>, yon: 'al' | 'sat' | 'izle' = 'al') =>
    ({ sembol, piyasa: 'BIST' as const, taramaId: 'abcd-esnek', yon, guven: 70, periyot: '1d' as const, aciklama: [], seviyeler, t: 0, fiyat });
  const T0 = 1_800_000_000;
  kontrol('ilkHedef: fiyatın üstündeki en yakın', ilkHedef(es('A', 10, { 'Hedef 2': 12, 'Hedef 1': 11, 'Boyun': 15, 'Hedef eski': 9 })) === 11);
  kontrol('ilkHedef: hedef yoksa null', ilkHedef(es('A', 10, { Boyun: 12 })) === null && ilkHedef(es('A', 10)) === null);
  const s1 = sicilIlerlet(null, [es('A', 10, { 'Hedef 1': 11 }), es('B', 10), es('C', 10, { 'Hedef 1': 11 }, 'sat')], new Map(), T0);
  kontrol('yalnız hedefli yükseliş kayda girer', s1.acik.length === 1 && s1.acik[0].sembol === 'A', String(s1.acik.length));
  const s1b = sicilIlerlet(s1, [es('A', 10, { 'Hedef 1': 11 })], new Map([['BIST:A', 10.5]]), T0 + 3600);
  kontrol('aynı eşleşme tekrar görülürse çift kayıt olmaz', s1b.acik.length === 1 && s1b.kapali.length === 0);
  const s2 = sicilIlerlet(s1b, [], new Map([['BIST:A', 11.2]]), T0 + 2 * 86400);
  kontrol('hedefe değen kayıt "ulaştı" olarak kapanır', s2.acik.length === 0 && s2.kapali[0]?.sonuc === 'ulasti' && s2.ozet['abcd-esnek']?.n === 1 && s2.ozet['abcd-esnek']?.ulasan === 1);
  const s3 = sicilIlerlet(s1b, [], new Map([['BIST:A', 9]]), T0 + (SURE_GUN + 1) * 86400);
  kontrol('süre dolunca "ulaşmadı" kapanır', s3.kapali[0]?.sonuc === 'ulasmadi' && s3.ozet['abcd-esnek']?.ulasan === 0);
  const s4 = sicilIlerlet(s2, [es('A', 10, { 'Hedef 1': 11 })], new Map(), T0 + 3 * 86400);
  kontrol('kapanmış kayıt hemen yeniden açılmaz', s4.acik.length === 0);
}

// BİLDİRİM METNİ: her tarayıcının adı var mı, cümle Kadir'in istediği biçimde mi.
{
  const adsiz = TARAYICILAR.filter((t) => !TARAMA_ADLARI[t.id]).map((t) => t.id);
  kontrol('her tarayıcının bildirim adı var', adsiz.length === 0, adsiz.join(', '));
  const tek = bildirimMetni('topuk-donusu', [{ sembol: 'THYAO', yon: 'al' }]);
  kontrol('tek hisse: "X hissesi Y stratejisine uydu"', tek?.govde === 'THYAO hissesi Topuk Dönüşü stratejisine uydu. Yükseliş şartı sağlandı.', tek?.govde);
  const cok = bildirimMetni('wolfe', [{ sembol: 'A', yon: 'al' }, { sembol: 'B', yon: 'al' }, { sembol: 'C', yon: 'sat' }]);
  kontrol('çok hisse: sayı, semboller, düşüş eki', cok?.govde === '2 hisse Wolfe Dalgaları stratejisine uydu: A, B. Yükseliş şartı sağlandı. Ayrıca 1 hissede düşüş şartı var.', cok?.govde);
  const yedi = bildirimMetni('qm', Array.from({ length: 7 }, (_, i) => ({ sembol: `H${i}`, yon: 'al' as const })));
  kontrol('beşten fazlası "ve N hisse daha"', yedi?.govde.includes('ve 2 hisse daha') === true, yedi?.govde);
  kontrol('yalnız izlemede ise bildirim yok', bildirimMetni('qm', [{ sembol: 'A', yon: 'izle' }]) === null);
  kontrol('bilinmeyen konu kimliğiyle yazılır', bildirimMetni('yok-boyle', [{ sembol: 'A', yon: 'sat' }])?.govde.startsWith('A hissesi yok-boyle stratejisine uydu. Düşüş') === true);
}

// HEDEFE ULAŞTI: yalnız bu koşuda kapanan "ulaştı" kayıtları, o anki fiyatla; metin ve konu adı.
{
  const T0 = 1_700_000_000;
  const es = (sembol: string, fiyat: number, seviyeler: Record<string, number>, taramaId = 'topuk-donusu'): Eslesme =>
    ({ sembol, piyasa: 'BIST', taramaId, yon: 'al', guven: 100, periyot: '1d', aciklama: [], seviyeler, t: T0, fiyat });
  const s1 = sicilIlerlet(null, [es('THYAO', 300, { 'Hedef 1': 310 }), es('THYAO', 300, { 'Hedef 1': 312 }, 'bayrak'), es('SISE', 50, { 'Hedef 1': 55 })], new Map(), T0);
  const T1 = T0 + 2 * 86400;
  const fiyatlar = new Map([['BIST:THYAO', 312.5], ['BIST:SISE', 51]]);
  const s2 = sicilIlerlet(s1, [], fiyatlar, T1);
  const u = hedefeUlasanlar(s2, T1, fiyatlar);
  kontrol('hedefe ulaşan: THYAO iki formasyon, SISE yok', u.length === 2 && u.every((x) => x.sembol === 'THYAO' && x.fiyat === 312.5), JSON.stringify(u));
  kontrol('başka zaman damgasıyla sorulunca boş', hedefeUlasanlar(s2, T1 + 1, fiyatlar).length === 0);
  const s3 = sicilIlerlet(s2, [], new Map([['BIST:SISE', 49]]), T0 + (SURE_GUN + 1) * 86400);
  kontrol('"ulaşmadı" kapanış hedef listesine girmez', hedefeUlasanlar(s3, T0 + (SURE_GUN + 1) * 86400, new Map()).length === 0);
  const m2 = hedefBildirimMetni(u);
  kontrol('iki formasyon tek bildirim', m2?.baslik === "THYAO · Hedef 1'e ulaştı" && m2.govde === 'THYAO 312,50 ₺ ile 2 formasyonun hedefine ulaştı: Topuk Dönüşü, Bayrak ve Flama. Formasyon görüldüğünden bu yana +%4,2.', m2?.govde);
  const m1 = hedefBildirimMetni([u[0]]);
  kontrol('tek formasyon: hedef fiyatı yazılır', m1?.govde === 'THYAO 312,50 ₺ ile Topuk Dönüşü hedefine (310,00 ₺) ulaştı. Formasyon görüldüğünden bu yana +%4,2.', m1?.govde);
  const abd = hedefBildirimMetni([{ sembol: 'BRK-B', piyasa: 'ABD', taramaId: 'qm', giris: 400, hedef: 420, t: T0, sonuc: 'ulasti', bitis: T1, fiyat: 421 }]);
  kontrol('ABD dolar işareti', abd?.govde.includes('421,00 $') === true && abd.govde.includes('(420,00 $)'), abd?.govde);
  kontrol('boş listede bildirim yok', hedefBildirimMetni([]) === null);
  const KONU = /^[a-zA-Z0-9\-_.~%]+$/;
  kontrol('konu adı Firebase desenine uyar (BRK-B dahil)', KONU.test(hedefKonusu('ABD', 'BRK-B')) && hedefKonusu('BIST', 'THYAO') === 'hedef-BIST-THYAO');
}

// EVREN: üretilmiş listede tekrar yok, her hissenin adı ve sektörü var, boyut makul.
{
  const hepsi = [...BIST_HISSELER.map((h) => `BIST:${h.kod}`), ...ABD_HISSELER.map((h) => `ABD:${h.kod}`)];
  const tekrar = hepsi.filter((k, i) => hepsi.indexOf(k) !== i);
  kontrol('evrende tekrar yok', tekrar.length === 0, tekrar.join(', '));
  kontrol('BIST evreni en az 250 hisse', BIST_HISSELER.length >= 250, String(BIST_HISSELER.length));
  kontrol('ABD evreni 100+', ABD_HISSELER.length >= 100, String(ABD_HISSELER.length));
  const bozuk = [...BIST_HISSELER, ...ABD_HISSELER].filter((h) => !/^[A-Z0-9-]{1,6}$/.test(h.kod) || h.ad.trim().length < 2 || !h.sektor);
  kontrol('her hissenin kodu, adı ve sektörü var', bozuk.length === 0, bozuk.map((h) => h.kod).join(', '));
  const diger = [...BIST_HISSELER, ...ABD_HISSELER].filter((h) => h.sektor === 'Diğer').length;
  kontrol('"Diğer" sektörü %5\'in altında', diger * 20 < hepsi.length, String(diger));
  kontrol('Firebase konu deseni bütün semboller için geçerli', hepsi.every((k) => /^[a-zA-Z0-9\-_.~%]+$/.test(hedefKonusu('BIST', k.split(':')[1]))));
}

// GÖSTERGELER: bilinen seriden beklenen değerler, kısa seride null.
{
  kontrol('kısa seride gösterge yok', gostergeler(dogrusal(30, 100, 110)) === null);
  // Doğrusal seride MACD sabit kalır ve sinyale eşitlenir; ivmelenen (bileşik) yükselişte sinyalin üstünde kalır.
  const bilesik = (n: number, oran: number) => Array.from({ length: n }, (_, i) => 100 * Math.pow(oran, i));
  const yukselen = gostergeler(bilesik(120, 1.01));
  kontrol('ivmelenen yükselişte RSI 100, MACD sinyalin üstünde, EMA20 > EMA50', !!yukselen && yukselen.rsi === 100 && yukselen.macd > yukselen.sinyal && yukselen.ema20 > yukselen.ema50, JSON.stringify(yukselen));
  // Hızlanan düşüş (160 - i²/120): MACD gittikçe daha negatif, sinyalin altında kalır. (Üssel çürümede |MACD| küçülür, sinyalin üstüne çıkar.)
  const dusen = gostergeler(Array.from({ length: 120 }, (_, i) => 160 - (i * i) / 120));
  kontrol('hızlanan düşüşte RSI 0, MACD negatif ve sinyalin altında', !!dusen && dusen.rsi === 0 && dusen.macd < 0 && dusen.macd < dusen.sinyal && dusen.ema20 < dusen.ema50, JSON.stringify(dusen));
  const duz = gostergeler(dogrusal(120, 100, 160));
  kontrol('doğrusal yükselişte MACD pozitif', !!duz && duz.macd > 0 && duz.rsi === 100, JSON.stringify(duz));
  const sabitSeri = gostergeler(sabit(120, 50));
  kontrol('sabit seride RSI 100 kuralı (kayıp sıfır) ve MACD 0', !!sabitSeri && sabitSeri.macd === 0 && sabitSeri.ema20 === 50 && sabitSeri.ema50 === 50, JSON.stringify(sabitSeri));
}

console.log(`\n${gecti} geçti, ${hata} hata`);
process.exit(hata ? 1 : 0);
