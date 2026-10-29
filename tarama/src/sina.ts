import type { Eslesme, Mum, Ortam, Seriler, Sicil, SicilKayit, TaramaSonucu } from './tipler';
import { aylik, dortSaatlik, haftalik } from './gostergeler/periyot';
import { ema } from './gostergeler/ortalama';
import { pivotlar } from './gostergeler/pivot';
import { heikin } from './gostergeler/heikin';
import { rsi } from './gostergeler/rsi';
import { enAzMum, TARAYICI_EN_AZ_MUM, TARAYICILAR } from './stratejiler';
import { eslesme, HEDEF_ESIK, kurus } from './stratejiler/ortak';
import { esnekDYuzde } from './stratejiler/formasyonlar';
import { bildirimMetni, haftaSonuMu, haftalikOzet, hedefBildirimMetni, hedefKonusu, sabahBrifingi, TARAMA_ADLARI, veriGuncelMi } from './bildirim-metin';
import { EN_AZ_HEDEF_ORANI, esikAltiKayit, hedefeUlasanlar, ilkHedef, KAYIT_GUN, sicilIlerlet, SURE_GUN } from './sicil';
import { hataTuru, VeriHatasi, yahooCoz } from './veri/yahoo';
import { ABD_HISSELER, BIST_HISSELER } from './veri/evren';
import { gostergeler } from './calistir';
import { EN_COK_GUN, gecmisIlerlet, gunBasi } from './gecmis';
import { GUNLUK_TARAYICILAR, hisseSicili } from './hisse-sicil';
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

/** Sınamalarda üretilen bütün eşleşmeler: sonda tavsiye dili ve bozuk değer taramasına girer. */
const uretilen: Eslesme[] = [];
const tarayici = (id: string) => {
  const t = TARAYICILAR.find((x) => x.id === id);
  if (!t) throw new Error(`tarayıcı yok: ${id}`);
  return { ...t, tara: (s: Seriler, o: Ortam) => { const e = t.tara(s, o); if (e) uretilen.push(e); return e; } };
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
  // Birebir: tarayıcısı olmayan konu adı (birlesik-123, endeks-nabzi) uygulamada "taranır" sanılmasın.
  const fazla = Object.keys(TARAMA_ADLARI).filter((id) => !TARAYICILAR.some((t) => t.id === id));
  kontrol('TARAMA_ADLARI anahtarları birebir tarayıcı kimlikleri (43)', fazla.length === 0 && Object.keys(TARAMA_ADLARI).length === TARAYICILAR.length && TARAYICILAR.length === 43, `fazla: ${fazla.join(', ')}; ${Object.keys(TARAMA_ADLARI).length}/${TARAYICILAR.length}`);
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

// BRİFİNG: sabah (yeni şartlar + güçlü adaylar) ve haftalık metinler; boş sonuçta da anlamlı cümle.
{
  const es = (sembol: string, taramaId: string, yon: 'al' | 'sat' | 'izle'): Eslesme => ({ sembol, piyasa: 'BIST', taramaId, yon, guven: 80, periyot: '1d', aciklama: [], t: 0, fiyat: 10 });
  const sonuc: TaramaSonucu = { surum: 1, uretildi: 0, ortam: ORTAM, sayac: {}, taranan: { BIST: 1, ABD: 1, hatali: [] },
    eslesmeler: [es('THYAO', 'bayrak', 'al'), es('THYAO', 'qm', 'al'), es('THYAO', 'ema200', 'al'), es('ASELS', 'bayrak', 'al'), es('SISE', 'qm', 'al'), es('SISE', 'ema200', 'al'), es('SISE', 'obo-tobo', 'al'), es('SISE', 'kama', 'sat'), es('GARAN', 'obo-tobo', 'sat')] };
  const yeni = [es('THYAO', 'bayrak', 'al'), es('ASELS', 'bayrak', 'al'), es('ASELS', 'qm', 'al'), es('GARAN', 'obo-tobo', 'sat')];
  const sb = sabahBrifingi(sonuc, yeni, Date.UTC(2026, 9, 26, 6, 45));
  kontrol('sabah: başlık günü taşır', /Sabah brifingi · .*26 Ekim/.test(sb.baslik), sb.baslik);
  kontrol('sabah: yeni şart tekil sayılır', sb.govde.startsWith('2 hissede yeni yükseliş şartı: THYAO, ASELS.'), sb.govde);
  kontrol('sabah: yeni düşüş ve güçlü aday (SISE düşüş şartı olduğu için aday değil)', /1 hissede yeni düşüş şartı\. Güçlü aday 1: THYAO\./.test(sb.govde), sb.govde);
  kontrol('sabah: en çok formasyon yeni şartlardan', /En çok görülen formasyon Bayrak ve Flama\./.test(sb.govde), sb.govde);
  kontrol('sabah: endeks nabzı', /Endeks nabzı BIST olumlu, ABD olumlu\./.test(sb.govde));
  const bos = sabahBrifingi({ ...sonuc, eslesmeler: [], ortam: { endeksNabzi: { XU100: null, SPX: { pozitif: false, ema8: 0, ema20: 1, t: 0 } } } }, []);
  kontrol('sabah: boş günde sabır cümlesi ve veri yok', /yeni yükseliş şartı oluşmadı/.test(bos.govde) && /BIST veri yok, ABD olumsuz/.test(bos.govde) && /Sabırlı/.test(bos.govde), bos.govde);
  const simdi = Date.UTC(2026, 9, 25, 15, 0);
  const sn = Math.floor(simdi / 1000);
  const kayit = (taramaId: string, sonucu: 'ulasti' | 'ulasmadi', gunOnce: number): SicilKayit => ({ sembol: 'X', piyasa: 'BIST', taramaId, giris: 10, hedef: 11, t: sn - 20 * 86400, sonuc: sonucu, bitis: sn - gunOnce * 86400 });
  const sicil: Sicil = { surum: 1, uretildi: sn, sureGun: 30, enAz: 5, acik: [kayit('qm', 'ulasti', 0)], ozet: {},
    kapali: [kayit('bayrak', 'ulasti', 1), kayit('bayrak', 'ulasti', 2), kayit('bayrak', 'ulasmadi', 3), kayit('qm', 'ulasmadi', 4), kayit('qm', 'ulasti', 12)] };
  const ho = haftalikOzet({ ...sonuc, portfoy: { hafta: { tur: 'hafta', anahtar: '2026-H43', baslangic: 0, pozisyonlar: [{ sembol: 'THYAO', piyasa: 'BIST', taramaId: 'qm', giris: 1, girisT: 0, simdi: 1, getiri: 0.02 }], deger: 102.3 }, ay: null, yil: null, gecmis: [] } }, sicil, simdi);
  kontrol('hafta: son 7 günde 4 kayıt, 2 hedef, 2 süresi dolan, yüzde 50', /Bu hafta 4 formasyon sonuçlandı: 2 hedefe ulaştı, 2 süresi doldu \(hedefe ulaşma oranı yüzde 50\)\./.test(ho.govde), ho.govde);
  kontrol('hafta: hedefe en sık ulaşan formasyon en az 3 kayıtla (isabet sözcüğü yok)', !/isabet/i.test(ho.govde) && /Geçmiş kayıtlarda hedefe en sık ulaşan formasyon Bayrak ve Flama: 3 kayıttan 2 hedef\./.test(ho.govde), ho.govde);
  kontrol('hafta: hayali portföy "yüzde 2,3 artıda"', /haftayı yüzde 2,3 artıda kapattı \(THYAO\)/.test(ho.govde), ho.govde);
  const portfoyle = (deger: number) => haftalikOzet({ ...sonuc, portfoy: { hafta: { tur: 'hafta', anahtar: '2026-H43', baslangic: 0, pozisyonlar: [], deger }, ay: null, yil: null, gecmis: [] } }, null, simdi).govde;
  kontrol('hafta: portföy ekside "yüzde 6,5 ekside"', /haftayı yüzde 6,5 ekside kapattı/.test(portfoyle(93.5)), portfoyle(93.5));
  kontrol('hafta: 99,96 "-0,0 ile ekside" değil "yatay"', /haftayı yatay kapattı/.test(portfoyle(99.96)) && !/-0,0/.test(portfoyle(99.96)), portfoyle(99.96));
  kontrol('hafta: açık kayıt ve pazartesi sayısı (THYAO, ASELS, SISE)', /Açık karne kaydı 1\. Pazartesi için 3 hissede/.test(ho.govde), ho.govde);
  kontrol('hafta: genç karne notu yok (süresi dolan var)', !/Karne yeni/.test(ho.govde));
  const genc: Sicil = { ...sicil, acik: Array.from({ length: 50 }, () => kayit('qm', 'ulasti', 0)), kapali: [kayit('bayrak', 'ulasti', 1), kayit('qm', 'ulasti', 2)] };
  kontrol('hafta: süresi dolan yoksa ve açık kayıt çoksa genç karne notu', /Karne yeni; süresi dolan kayıt henüz yok/.test(haftalikOzet(sonuc, genc, simdi).govde));
  kontrol('hafta: sicil yoksa yine cümle', /sonuçlanan formasyon kaydı yok/.test(haftalikOzet(sonuc, null, simdi).govde));
}

// GEÇMİŞ: gün başı İstanbul'a göre, aynı gün günceller, yeni gün ekler, 400 sınırı, eksik veri null.
{
  const t = Math.floor(Date.UTC(2026, 9, 24, 20, 30) / 1000); // 23:30 TR
  kontrol('gün başı 24 Ekim 00:00 TR', gunBasi(t) === Math.floor(Date.UTC(2026, 9, 23, 21, 0) / 1000));
  kontrol('gün başı: 00:30 TR hâlâ aynı gün', gunBasi(Math.floor(Date.UTC(2026, 9, 23, 21, 30) / 1000)) === gunBasi(t));
  const g1 = gecmisIlerlet(null, t - 6 * 3600, { xu100: 10000, spx: 5000 }, null);
  kontrol('ilk satır', g1.gunler.length === 1 && g1.gunler[0].xu100 === 10000 && g1.gunler[0].hayali.yil === null);
  const g2 = gecmisIlerlet(g1, t, { xu100: 10100, spx: null }, { hafta: null, ay: null, yil: { tur: 'yil', anahtar: '2026', baslangic: 0, pozisyonlar: [], deger: 97.5 }, gecmis: [] });
  kontrol('aynı gün ikinci koşu satırı günceller', g2.gunler.length === 1 && g2.gunler[0].xu100 === 10100 && g2.gunler[0].spx === null && g2.gunler[0].hayali.yil === 97.5);
  const g3 = gecmisIlerlet(g2, t + 86400, { xu100: 10200, spx: 5100 }, null);
  kontrol('yeni gün eklenir, sıra korunur', g3.gunler.length === 2 && g3.gunler[1].xu100 === 10200 && g3.gunler[0].t < g3.gunler[1].t);
  let g = g3;
  for (let i = 2; i < EN_COK_GUN + 20; i++) g = gecmisIlerlet(g, t + i * 86400, { xu100: 1, spx: 1 }, null);
  kontrol('400 gün sınırı', g.gunler.length === EN_COK_GUN && g.gunler[0].t > g3.gunler[0].t);
}

// HİSSE SİCİLİ: geçmişte gün gün yürütme, kümeleme, sonuç ve süre.
{
  const yakinHedef: Eslesme = { sembol: 'A', piyasa: 'BIST', taramaId: 'abcd-esnek', yon: 'al', guven: 60, periyot: '1d', aciklama: [], seviyeler: { 'Hedef 1': 10.05, 'Hedef 2': 10.4 }, t: 0, fiyat: 10 };
  kontrol('ilkHedef yüzde 1,5\'ten yakını atlar, sonrakini alır', ilkHedef(yakinHedef) === 10.4 && EN_AZ_HEDEF_ORANI === 1.015);
  kontrol('ilkHedef hepsi yakınsa null', ilkHedef({ ...yakinHedef, seviyeler: { 'Hedef 1': 10.1 } }) === null);
  kontrol('günlük tarayıcı listesi makul (20-35)', GUNLUK_TARAYICILAR.length >= 20 && GUNLUK_TARAYICILAR.length <= 35, String(GUNLUK_TARAYICILAR.length));
  // 260 yatay + bayrak (direk 80→100, bez 7 mum, kırılım 101) + hedefe (direk boyu 20 → 121) 10 günde ulaşan yükseliş + 40 yatay.
  const b = [...sabit(260, 80), ...dogrusal(10, 80, 100), ...dogrusal(7, 100, 96), 101, ...dogrusal(10, 102, 123), ...sabit(40, 123)];
  const hacim = b.map((_, i) => (i === 277 ? 1800 : 1000));
  const hs = hisseSicili('T', 'BIST', mumla(b, hacim, 0.004), GUNLUK_TARAYICILAR, 100, 30);
  const bayrak = hs.son.filter((k) => k.taramaId === 'bayrak');
  kontrol('bayrak kaydı var ve tek (küme)', bayrak.length === 1, String(bayrak.length));
  kontrol('bayrak hedefe ulaştı, gün sayısı var', bayrak[0]?.sonuc === 'ulasti' && (bayrak[0]?.gun ?? 0) > 0 && (bayrak[0]?.gun ?? 99) <= 12, JSON.stringify(bayrak[0]));
  kontrol('kapalı sayım tutarlı', hs.n >= 1 && hs.u <= hs.n && hs.formasyon.bayrak?.u === 1);
  // Hedefe ulaşmayan: kırılımdan sonra düşüş.
  const b2 = [...sabit(260, 80), ...dogrusal(10, 80, 100), ...dogrusal(7, 100, 96), 101, ...dogrusal(40, 100, 90)];
  const hs2 = hisseSicili('T', 'BIST', mumla(b2, b2.map((_, i) => (i === 277 ? 1800 : 1000)), 0.004), GUNLUK_TARAYICILAR, 100, 30);
  const bayrak2 = hs2.son.filter((k) => k.taramaId === 'bayrak');
  kontrol('ulaşmayan bayrak "ulasmadi"', bayrak2[0]?.sonuc === 'ulasmadi', JSON.stringify(bayrak2[0]));
  // Son 5 günde oluşan kayıt "acik" kalır.
  const b3 = [...sabit(260, 80), ...dogrusal(10, 80, 100), ...dogrusal(7, 100, 96), 101, 102, 103];
  const hs3 = hisseSicili('T', 'BIST', mumla(b3, b3.map((_, i) => (i === 277 ? 1800 : 1000)), 0.004), GUNLUK_TARAYICILAR, 100, 30);
  kontrol('yeni kayıt açık, sayıma girmez', hs3.son.some((k) => k.taramaId === 'bayrak' && k.sonuc === 'acik') && !hs3.formasyon.bayrak);
  kontrol('düz seride kayıt yok', hisseSicili('T', 'BIST', mumla(sabit(400, 50)), GUNLUK_TARAYICILAR, 100, 30).son.length === 0);
}

// ABCD: %127/%161 ölçüleri D'nin tamamlanma bölgesidir ("D bölgesi"); karneye giren "Hedef" fiyatın üstünde olmalı.
console.log('abcd: D bölgesi ve gerçek hedef');
{
  // Düşüş ABCD: A 120 tepe, B 100 dip, C %61,8 geri alım (112,36), D = C + (B-C)·1,272 ≈ 96,64; son mum D'de.
  const A = 120; const B = 100; const C = B + (A - B) * 0.618; const D = C + (B - C) * 1.272;
  const k = [...sabit(60, 104), ...dogrusal(15, 104, A), ...dogrusal(12, A, B), ...dogrusal(10, B, C), ...dogrusal(12, C, D)];
  const s = seri(mumla(k, undefined, 0.002));
  for (const id of ['abcd-esnek', 'abcd-klasik']) {
    const e = tarayici(id).tara(s, ORTAM);
    kontrol(`${id}: düşüş ABCD uymalı, yön al`, e !== null && e.yon === 'al', e ? e.yon + ' ' + JSON.stringify(e.seviyeler) : 'null');
    if (!e?.seviyeler) continue;
    const hedefler = Object.entries(e.seviyeler).filter(([ad]) => /hedef/i.test(ad));
    kontrol(`${id}: "Hedef" adlı her seviye fiyatın en az yüzde 1,5 üstünde`, hedefler.length >= 2 && hedefler.every(([, v]) => v >= e.fiyat * EN_AZ_HEDEF_ORANI), JSON.stringify(hedefler) + ' fiyat ' + e.fiyat);
    kontrol(`${id}: D tamamlanma ölçüleri "D bölgesi" adını taşır`, Object.keys(e.seviyeler).some((ad) => /^D bölgesi/.test(ad)), Object.keys(e.seviyeler).join(', '));
    const h1 = ilkHedef(e);
    kontrol(`${id}: karne hedefi CD'nin %38,2 geri alımı`, h1 !== null && Math.abs(h1 - (D + (C - D) * 0.382)) / h1 < 0.03, String(h1));
  }
}

// SAHTE ÇIKIŞ: gerekçe grafikle çelişmesin. Banda değip altına kapanan seri eşleşmez; gün sayısı gerçek dipten sayılır.
console.log('sahte çıkış: bant ve dönüş günü');
{
  // Dip 80, tepe 120 (%50 yükseliş), maliyet bandı %61,8 = 95,28 (± %3: 92,42 ile 98,14).
  const maliyet = 120 + (80 - 120) * 0.618;
  const taban = [...sabit(60, 104), ...dogrusal(20, 104, 80).slice(1), ...dogrusal(20, 80, 120).slice(1), ...dogrusal(15, 120, maliyet).slice(1)];
  const sahte = tarayici('sahte-cikis');
  // Uymalı: banda indi, 5 gün yukarı döndü (99), hedef 104,81 fiyatın üstünde.
  const iyi = sahte.tara(seri(mumla([...taban, ...dogrusal(6, maliyet, 99).slice(1)], undefined, 0.002)), ORTAM);
  kontrol('sahte çıkış: banda inip dönen seri uymalı', iyi !== null && iyi.yon === 'al', iyi ? '' : 'null');
  kontrol('sahte çıkış: gün sayısı dipten (5 gün önce)', !!iyi && /Dip [\d.,]+, 5 gün önce/.test(iyi.aciklama[0]), iyi?.aciklama[0]);
  kontrol('sahte çıkış: "0 gün" yazmaz', !!iyi && !/\b0 gün/.test(iyi.aciklama.join(' ')), iyi?.aciklama[0]);
  kontrol('sahte çıkış: hedef fiyatın en az %1,5 üstünde', !!iyi && (iyi.seviyeler?.['%38,2 hedefi'] ?? 0) >= iyi.fiyat * EN_AZ_HEDEF_ORANI, JSON.stringify(iyi?.seviyeler));
  // Uymamalı: banda değdi, sonra 86'ya düştü ve 89,5'e tepki verdi (dipten %4 yukarı, ama kapanış bandın %6 altında).
  // Eski kod bu seriye "Satış, maliyet bandında durdu ve fiyat 5 gündür yukarı dönüyor" diyordu.
  const kotu = [...taban, ...dogrusal(5, maliyet, 86).slice(1), ...dogrusal(3, 86, 89.5).slice(1)];
  kontrol('sahte çıkış: banda değip altına düşen seri uymaz', sahte.tara(seri(mumla(kotu, undefined, 0.002)), ORTAM) === null);
  // Uymamalı: bandın hemen altına (88) sarktı, 4 gündür yükseliyor ama son kapanış hâlâ bandın altında (92 < 92,42).
  const sonAlt = [...taban, ...dogrusal(4, maliyet, 88).slice(1), ...dogrusal(5, 88, 92).slice(1)];
  kontrol('sahte çıkış: son kapanış bandın altındaysa uymaz', sahte.tara(seri(mumla(sonAlt, undefined, 0.002)), ORTAM) === null);
  // Uymamalı: dip bugün. Bugünkü mumun fitili bandın içinde (93,5) ve kapanış ondan %4 yukarıda; eski kod "0 gündür yukarı dönüyor" diyordu.
  const dipBugunM = mumla([...taban, ...dogrusal(4, maliyet, 97.5).slice(1)], undefined, 0.002);
  const onceki = dipBugunM[dipBugunM.length - 1];
  dipBugunM.push({ t: onceki.t + 86400, a: 97.5, y: 98, d: 93.5, k: 97.5, h: 1000 });
  kontrol('sahte çıkış: dip bugünse uymaz (dönüş 0 gün)', sahte.tara(seri(dipBugunM), ORTAM) === null);
}

// ESNEK ABCD 1/C: yüzde = 10000 / C, dört ondalıklı katsayı (ders 1/52 = 0,0192 → 192 öğretir).
console.log('esnek abcd: 1 bölü C');
{
  kontrol('1/84 → yüzde 119', esnekDYuzde(84) === 119, String(esnekDYuzde(84)));
  kontrol('1/52 → yüzde 192', esnekDYuzde(52) === 192, String(esnekDYuzde(52)));
  kontrol('1/95 → yüzde 105', esnekDYuzde(95) === 105, String(esnekDYuzde(95)));
}

// HEDEF SÜZGECİ: yön yukarıysa fiyatın %1,5 üstünde olmayan seviye "hedef" adını taşımaz; liste sıralı ve numaralar sırayla.
console.log('hedef süzgeci');
{
  kontrol('hedef eşiği sicil ve uygulama ile aynı (1,015)', HEDEF_ESIK === EN_AZ_HEDEF_ORANI);
  const g = mumla(dogrusal(30, 10, 20)); // son kapanış 20
  const e = eslesme(seri(g), 'x', '1d', 'al', 50, ['a'], { 'Hedef 1 (yakın)': 20.1, 'Hedef 2 (uzak)': 22, '%38,2 hedefi': 19, 'Hedef 3 (orta)': 21, Stop: 18 });
  kontrol('al: fiyatın altındaki ve %1,5 yakınındaki hedef atılır, kalanlar sırayla numaralanır',
    !!e && JSON.stringify(e.seviyeler) === JSON.stringify({ Stop: 18, 'Hedef 1 (orta)': 21, 'Hedef 2 (uzak)': 22 }), JSON.stringify(e?.seviyeler));
  const s2 = eslesme(seri(g), 'x', '1d', 'sat', 50, ['a'], { 'Hedef (aşağı)': 18, 'Hedef (yukarı)': 23, 'Hedef 1 (yakın)': 19.9 });
  kontrol('sat: fiyatın üstündeki ve yakınındaki hedef atılır', !!s2 && JSON.stringify(s2.seviyeler) === JSON.stringify({ 'Hedef (aşağı)': 18 }), JSON.stringify(s2?.seviyeler));
  const iz = eslesme(seri(g), 'x', '1d', 'izle', 50, ['a'], { 'Hedef (yukarı)': 23, 'Hedef (aşağı)': 17, 'Hedef (formasyon boyu)': 20.2 });
  kontrol('izle: iki yönlü hedef kalır, fiyata %1,5 yakını atılır', !!iz && Object.keys(iz.seviyeler ?? {}).length === 2 && !('Hedef (formasyon boyu)' in (iz.seviyeler ?? {})), JSON.stringify(iz?.seviyeler));
}

// eslesme(): bozuk fiyat ve seviye süzgeci.
console.log('eslesme süzgeci');
{
  const g = mumla(dogrusal(30, 10, 20));
  const bozukSon = [...g.slice(0, -1), { ...g[g.length - 1], k: 0 }];
  kontrol('son kapanış 0 ise eşleşme yok', eslesme(seri(bozukSon), 'x', '1d', 'al', 50, ['a']) === null);
  const nanSon = [...g.slice(0, -1), { ...g[g.length - 1], k: NaN }];
  kontrol('son kapanış NaN ise eşleşme yok', eslesme(seri(nanSon), 'x', '1d', 'al', 50, ['a']) === null);
  kontrol('boş seride eşleşme yok', eslesme(seri([]), 'x', '1d', 'al', 50, ['a']) === null);
  const e = eslesme(seri(g), 'x', '1d', 'al', 50, ['a'], { Iyi: 5, Sifir: 0, Eksi: -3, Nan: NaN, Sonsuz: Infinity });
  kontrol('sıfır, eksi, NaN, sonsuz seviyeler atılır', !!e && JSON.stringify(e.seviyeler) === '{"Iyi":5}', JSON.stringify(e?.seviyeler));
  kontrol('gerekçede Infinity varsa eşleşme yok', eslesme(seri(g), 'x', '1d', 'al', 50, ['yüzde Infinity yükseliş']) === null);
}

// SİCİL: eşik öncesi kayıt temizliği, kümülatif özet, 30 günlük dosya penceresi.
console.log('sicil temizliği ve kümülatif özet');
{
  const T0 = 1_800_000_000;
  const kayit = (sembol: string, giris: number, hedef: number, sonuc?: 'ulasti' | 'ulasmadi', bitis?: number, taramaId = 'abcd-esnek'): SicilKayit =>
    ({ sembol, piyasa: 'BIST', taramaId, giris, hedef, t: T0 - 5 * 86400, ...(sonuc ? { sonuc, bitis } : {}) });
  kontrol('eşik altı: hedef girişe yüzde 1,5\'ten yakın', esikAltiKayit(kayit('A', 100, 100.3)) && !esikAltiKayit(kayit('A', 100, 101.5)));
  const kirli: Sicil = {
    surum: 1, uretildi: T0, sureGun: 30, enAz: 5,
    acik: [kayit('A', 100, 100.3), kayit('B', 100, 110)],
    kapali: [kayit('C', 100, 100.2, 'ulasti', T0), kayit('D', 100, 100.1, 'ulasti', T0), kayit('E', 100, 108, 'ulasmadi', T0), kayit('F', 100, 105, 'ulasti', T0, 'qm')],
    ozet: { 'abcd-esnek': { n: 3, ulasan: 2 }, qm: { n: 1, ulasan: 1 } },
  };
  const t1 = sicilIlerlet(kirli, [], new Map(), T0 + 3600);
  kontrol('eşik altı açık kayıt düşer', t1.acik.length === 1 && t1.acik[0].sembol === 'B', t1.acik.map((k) => k.sembol).join(','));
  kontrol('eşik altı kapalı kayıt düşer', t1.kapali.length === 2 && t1.kapali.every((k) => !esikAltiKayit(k)), t1.kapali.map((k) => k.sembol).join(','));
  kontrol('özet kalan kapanışlardan yeniden kurulur (abcd-esnek 1/0)', t1.ozet['abcd-esnek']?.n === 1 && t1.ozet['abcd-esnek']?.ulasan === 0 && t1.ozet.qm?.n === 1, JSON.stringify(t1.ozet));
  const t2 = sicilIlerlet(t1, [], new Map([['BIST:B', 111]]), T0 + 7200);
  kontrol('temizlik sonrası özet kümülatif artar', t2.ozet['abcd-esnek']?.n === 2 && t2.ozet['abcd-esnek']?.ulasan === 1, JSON.stringify(t2.ozet));
  kontrol('önceki sicilin özeti değişmez', t1.ozet['abcd-esnek']?.n === 1);
  const t3 = sicilIlerlet(t2, [], new Map(), T0 + (KAYIT_GUN + 1) * 86400);
  kontrol('30 günü geçen kapanış dosyadan düşer, özette kalır', t3.kapali.length === 0 && t3.ozet['abcd-esnek']?.n === 2 && t3.ozet.qm?.n === 1, `${t3.kapali.length} ${JSON.stringify(t3.ozet)}`);
  const ho = haftalikOzet({ surum: 1, uretildi: 0, ortam: ORTAM, sayac: {}, taranan: { BIST: 1, ABD: 1, hatali: [] }, eslesmeler: [] }, kirli, (T0 + 3600) * 1000);
  kontrol('haftalık özet eşik altı kapanışları saymaz (2 kayıt: 1 hedef, 1 süresi doldu)', /Bu hafta 2 formasyon sonuçlandı: 1 hedefe ulaştı, 1 süresi doldu/.test(ho.govde) && /Açık karne kaydı 1\./.test(ho.govde), ho.govde);
}

// BRİFİNG TAZELİĞİ: tarama düşmüşse eski aday listesi gönderilmez; hafta sonu payı.
console.log('brifing tazeliği');
{
  const sn = (y: number, ay: number, g: number, sa: number, dk = 0) => Math.floor(Date.UTC(y, ay, g, sa, dk) / 1000);
  const cumaGece = sn(2026, 9, 23, 21, 47); // ABD kapanış taraması: 23 Ekim cuma 21:47 UTC = 24 Ekim cumartesi 00:47 TR
  kontrol('pazartesi sabahı cuma gece taraması güncel', veriGuncelMi(cumaGece, sn(2026, 9, 26, 6, 45)));
  kontrol('pazar akşamı haftalık için güncel', veriGuncelMi(cumaGece, sn(2026, 9, 25, 15, 3)));
  kontrol('salı sabahı cuma taraması eski', !veriGuncelMi(cumaGece, sn(2026, 9, 27, 6, 45)));
  kontrol('altı gün önceki tarama eski', !veriGuncelMi(sn(2026, 9, 20, 20, 0), sn(2026, 9, 26, 6, 45)));
  kontrol('dün geceki tarama güncel', veriGuncelMi(sn(2026, 9, 26, 21, 47), sn(2026, 9, 27, 6, 45)));
  kontrol('pazartesi sabahı cuma BIST kapanış taraması (15:17 UTC) güncel', veriGuncelMi(sn(2026, 9, 23, 15, 17), sn(2026, 9, 26, 6, 45)));
  kontrol('çarşamba sabahı pazartesi taraması eski', !veriGuncelMi(sn(2026, 9, 26, 15, 17), sn(2026, 9, 28, 6, 45)));
  kontrol('üretim zamanı yoksa güncel değil', !veriGuncelMi(0, sn(2026, 9, 27, 6, 45)));
  kontrol('hafta sonu: cumartesi ve pazar İstanbul saatiyle', haftaSonuMu(sn(2026, 9, 24, 12)) && haftaSonuMu(sn(2026, 9, 25, 20, 59)) && !haftaSonuMu(sn(2026, 9, 25, 21, 1)) && !haftaSonuMu(sn(2026, 9, 23, 12)));
}

// 4 SAATLİK: seans günü iki eşit parçaya bölünür (9 mumlu BIST günü 4+4+1 olmasın).
console.log('dört saatlik bölme');
{
  const gunMum = (gun: number, n: number): Mum[] => Array.from({ length: n }, (_, j) => ({ t: Date.UTC(2026, 9, 20 + gun, 7 + j) / 1000, a: 10 + j, y: 11 + j, d: 9 + j, k: 10.5 + j, h: 100 }));
  const d9 = dortSaatlik(gunMum(0, 9));
  kontrol('9 saatlik mum → 2 mum (5+4)', d9.length === 2 && d9[0].h === 500 && d9[1].h === 400, d9.map((m) => m.h).join('+'));
  kontrol('8 saatlik mum → 4+4, açılış/kapanış doğru', (() => { const d = dortSaatlik(gunMum(0, 8)); return d.length === 2 && d[0].a === 10 && d[0].k === 13.5 && d[1].a === 14 && d[1].y === 18 && d[1].k === 17.5; })());
  kontrol('7 saatlik (ABD) → 4+3', dortSaatlik(gunMum(0, 7)).map((m) => m.h).join('+') === '400+300');
  kontrol('iki gün ayrı bölünür', dortSaatlik([...gunMum(0, 9), ...gunMum(1, 3)]).map((m) => m.h).join('+') === '500+400+200+100');
  kontrol('boş seride boş', dortSaatlik([]).length === 0);
}

// VERİ KAYNAĞI: Yahoo cevabında null/sıfır alanlı mum atlanır; hata türü taşınır.
console.log('yahoo çözümleme ve hata türü');
{
  const cevap = { chart: { result: [{ timestamp: [1, 2, 3, 4, 5], indicators: { quote: [{ open: [10, 10, 10, 10, 10], high: [11, null, 11, 11, 11], low: [9, 9, null, 0, 9], close: [10.5, 10.5, 10.5, 10.5, null], volume: [100, 100, null, 100, 100] }] } }] } };
  const m = yahooCoz(cevap);
  kontrol('null yüksek, null/sıfır düşük, null kapanış atlanır', m.length === 1 && m[0].t === 1, JSON.stringify(m));
  kontrol('eksik gösterge alanında çökmez', yahooCoz({ chart: { result: [{ timestamp: [1] }] } }).length === 0 && yahooCoz({}).length === 0);
  kontrol('hata türü taşınır', hataTuru(new VeriHatasi('kisa', 'x')) === 'kisa' && hataTuru(new Error('x')) === 'ag');
}

// FCM: bozuk gizli değerde sabit mesaj (ayrıştırıcı hatası gizli değerin parçasını günlüğe basmasın).
{
  const { hesabiOku } = require('./fcm') as typeof import('./fcm');
  const eski = process.env.FCM_SERVIS_HESABI;
  process.env.FCM_SERVIS_HESABI = Buffer.from('{"private_key":"GIZLI-PARCA",').toString('base64');
  let mesaj = '';
  try { hesabiOku(); } catch (h) { mesaj = (h as Error).message; }
  kontrol('bozuk servis hesabı: sabit mesaj, gizli değer günlüğe düşmez', mesaj.startsWith('FCM_SERVIS_HESABI çözülemedi') && !mesaj.includes('GIZLI'), mesaj);
  if (eski === undefined) delete process.env.FCM_SERVIS_HESABI; else process.env.FCM_SERVIS_HESABI = eski;
}

// RSI: düz seride nötr 50 (eskiden 100: "aşırı alım").
{
  kontrol('düz seride RSI 50', rsi(sabit(50, 10), 14).at(-1) === 50, String(rsi(sabit(50, 10), 14).at(-1)));
  kontrol('yalnız yükselişte RSI 100 kalır', rsi(dogrusal(30, 10, 20), 14).at(-1) === 100);
}

// KISA GEÇMİŞ: tablodaki her kimlik gerçek bir tarayıcı; her biri kendi alt sınırında çökmez.
console.log('kısa geçmiş tablosu');
{
  const ids = new Set(TARAYICILAR.map((t) => t.id));
  const yabanci = Object.keys(TARAYICI_EN_AZ_MUM).filter((id) => !ids.has(id));
  kontrol('kısa geçmiş tablosunda bilinmeyen kimlik yok', yabanci.length === 0, yabanci.join(', '));
  kontrol('200 günlük ortalama isteyenler 250 bekler', enAzMum(tarayici('ema200')) === 250 && enAzMum(tarayici('fib-merdiveni')) === 250 && enAzMum(tarayici('yutan')) === 60);
  const cokenler: string[] = [];
  for (const t of TARAYICILAR) {
    const n = enAzMum(t);
    if (n >= 250) continue;
    for (let r = 0; r < 20; r++) {
      try { const e = t.tara(seri(mumla(dalga(n, 50, 5 + r, 15 + r))), ORTAM); if (e) uretilen.push(e); } catch (h) { cokenler.push(`${t.id}: ${(h as Error).message}`); break; }
    }
  }
  kontrol('kısa seriye izinli tarayıcılar alt sınırda çökmez', cokenler.length === 0, cokenler.join(' | '));
}

// SENTETİK SERİ SINAMASI: uç durumlar + 3000 rastgele yürüyüş, her tarayıcı. Çökme, NaN, sıfır/eksi seviye,
// bozuk çizim, uzun tire ve tavsiye dili aranır. (Denetimde 44 ters fincan eksi hedefi, düğüm/heikin çökmesi buradan çıktı.)
console.log('sentetik seriler (3000 rastgele + uç durumlar)');
{
  let tohum = 1;
  const rnd = () => { tohum = (tohum * 16807) % 2147483647; return tohum / 2147483647; };
  const yuruyus = (n: number, bas = 100, oyn = 0.02, egilim = 0) => { const o: number[] = []; let v = bas; for (let i = 0; i < n; i++) { v *= 1 + egilim + (rnd() - 0.5) * 2 * oyn; o.push(v); } return o; };
  const durumlar: [string, Mum[]][] = [
    ['boş', []], ['tek mum', mumla([100])], ['iki mum', mumla([100, 101])], ['5 mum', mumla([1, 2, 3, 4, 5])],
    ['30 mum', mumla(yuruyus(30))], ['100 mum', mumla(yuruyus(100))],
    ['250 düz genliksiz', mumla(sabit(250, 50), undefined, 0)], ['800 düz genliksiz', mumla(sabit(800, 50), undefined, 0)], ['800 düz genlikli', mumla(sabit(800, 50))],
    ['800 sıfır hacim', mumla(yuruyus(800), sabit(800, 0))],
    ['800 NaN kapanış ortada', mumla(yuruyus(800).map((v, i) => (i === 700 ? NaN : v)))],
    ['800 NaN son mum', mumla(yuruyus(800).map((v, i) => (i === 799 ? NaN : v)))],
    ['800 NaN hacim', mumla(yuruyus(800), Array.from({ length: 800 }, (_, i) => (i % 50 === 0 ? NaN : 1000)))],
    ['800 null yüksek', mumla(yuruyus(800)).map((m, i) => (i === 790 ? { ...m, y: null as unknown as number } : m))],
    ['800 çok küçük fiyat', mumla(yuruyus(800, 0.01))],
    ['800 çöküş %97', mumla([...yuruyus(700, 100, 0.01), ...Array.from({ length: 100 }, (_, i) => 100 * Math.pow(0.965, i))])],
    ['800 tavan serisi', mumla([...yuruyus(700, 10, 0.01), ...Array.from({ length: 100 }, (_, i) => 10 * Math.pow(1.05, i))])],
    ['800 sıfır fiyat arada', mumla(yuruyus(800).map((v, i) => (i > 780 && i < 785 ? 0 : v)))],
  ];
  const bulgu: Record<string, { n: number; ornek: string }> = {};
  const not = (id: string, tur: string, ornek: string) => { const a = `${id} :: ${tur}`; (bulgu[a] ??= { n: 0, ornek }).n++; };
  const say: Record<string, number> = {};
  const denetle = (e: Eslesme, m: Mum[]) => {
    const n = m.length;
    say[e.taramaId] = (say[e.taramaId] ?? 0) + 1;
    if (!Number.isFinite(e.fiyat) || e.fiyat <= 0) not(e.taramaId, 'fiyat bozuk', String(e.fiyat));
    if (!Number.isInteger(e.guven) || e.guven < 0 || e.guven > 100) not(e.taramaId, 'güven aralık dışı', String(e.guven));
    for (const [ad, v] of Object.entries(e.seviyeler ?? {})) if (!Number.isFinite(v) || v <= 0) not(e.taramaId, 'seviye sonlu değil ya da ≤ 0', `${ad}=${v}`);
    const metin = e.aciklama.join(' | ');
    if (/NaN|Infinity|undefined|null/.test(metin)) not(e.taramaId, 'gerekçede NaN', metin.slice(0, 120));
    if (metin.includes('—')) not(e.taramaId, 'uzun tire', metin.slice(0, 120));
    const c = e.cizim;
    for (const q of [...(c?.noktalar ?? []), ...(c?.cizgiler ?? []).flatMap((l) => [l.a, l.b])]) {
      if (!Number.isInteger(q.g) || q.g < 0 || q.g >= n) not(e.taramaId, 'çizim g bozuk', String(q.g));
      if (!Number.isFinite(q.fiyat) || q.fiyat <= 0) not(e.taramaId, 'çizim fiyat bozuk', String(q.fiyat));
    }
    // Kama: iki çizgi de sıfırın üstünde (eslesme süzgeci düşürse çizgi eksik kalır) ve hedef fiyatın 3 katını aşmaz.
    if (e.taramaId === 'kama') {
      const h = e.seviyeler?.['Hedef (kamanın başı)'];
      if ((c?.cizgiler?.length ?? 0) !== 2 || e.seviyeler?.['Alt çizgi'] === undefined || e.seviyeler?.['Üst çizgi'] === undefined) not('kama', 'çizgi sıfırın altında', JSON.stringify(e.seviyeler));
      if (h !== undefined && h > e.fiyat * 3) not('kama', 'hedef fiyatın 3 katından uzak', `${h} / ${e.fiyat}`);
    }
    // Topuk noktası, dipten önceki en yüksek mumun ÜSTÜNDE durmalı (pencerenin ilk mumunda değil).
    const topuk = e.taramaId === 'topuk-donusu' ? c?.noktalar?.find((q) => q.ad === 'Topuk') : undefined;
    if (topuk && Math.abs(m[n - 1 - topuk.g].y - topuk.fiyat) > 0.006) not(e.taramaId, 'topuk noktası tepe mumunda değil', `g=${topuk.g} mum ${m[n - 1 - topuk.g].y} nokta ${topuk.fiyat}`);
    // Wolfe 1-4 çizgisi son mumda bitiyor; 4 noktasından geçmeli (eskiden ucu 10 mum ilerinin değeriyle eğimi bozuyordu).
    if (e.taramaId === 'wolfe' && c?.noktalar?.length === 5) {
      const [w1, , , w4] = c.noktalar;
      const hedefCizgisi = c.cizgiler?.at(-1);
      if (hedefCizgisi && hedefCizgisi.a.ad === '1' && hedefCizgisi.b.g === 0 && w1.g !== 0) {
        const f4 = w1.fiyat + ((hedefCizgisi.b.fiyat - w1.fiyat) * (w1.g - w4.g)) / w1.g;
        if (Math.abs(f4 - w4.fiyat) > Math.max(0.03, w4.fiyat * 0.002)) not(e.taramaId, 'wolfe 1-4 çizgisi 4 noktasından geçmiyor', `${f4.toFixed(3)} ≠ ${w4.fiyat}`);
      }
    }
  };
  const calistir = (g: Mum[]) => {
    const s = seri(g);
    for (const t of TARAYICILAR) {
      if (g.length < enAzMum(t) && g.length >= 60) continue; // canlı çalıştırıcı da kısa seride atlar
      let e: Eslesme | null = null;
      try { e = t.tara(s, ORTAM); } catch (h) { not(t.id, 'ÇÖKME', (h as Error).message); continue; }
      if (e) { uretilen.push(e); denetle(e, s[e.periyot]); }
    }
  };
  for (const [, g] of durumlar) calistir(g);
  for (let r = 0; r < 3000; r++) {
    const n = 260 + Math.floor(rnd() * 600);
    const k = yuruyus(n, 0.5 + rnd() * 500, 0.005 + rnd() * 0.08, (rnd() - 0.5) * 0.004);
    calistir(mumla(k, k.map(() => (rnd() < 0.05 ? 0 : Math.floor(rnd() * 1e6))), rnd() * 0.04));
  }
  const satirlar = Object.entries(bulgu).map(([a, { n, ornek }]) => `${n}× ${a} [${ornek}]`);
  kontrol('sentetik: çökme, NaN, sıfır/eksi seviye, bozuk çizim yok', satirlar.length === 0, '\n    ' + satirlar.join('\n    '));
  const eslesen = Object.keys(say).length;
  console.log('  3000 seri eşleşme sayıları: ' + Object.entries(say).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', '));
  kontrol('sentetik: tarayıcıların çoğu en az bir kez eşleşti (sınama gerçekten çalıştı)', eslesen >= TARAYICILAR.length - 3, `${eslesen}/${TARAYICILAR.length}`);
}

// TAVSİYE DİLİ: bütün sınamalarda üretilen gerekçeler (sentetik + yukarıdaki örnekler). Tarif dili: "kural ... sayar".
{
  const YASAK = /\b(al|sat) şartı|alış şartı|satış şartı|giriş yeri|çıkış yeri|alınmaz|konmalı|yapılır|alınmalı|pozisyon artır|elde mal varsa|olunmalı/i;
  const bulunan = new Map<string, string>();
  for (const e of uretilen) for (const c of e.aciklama) if (YASAK.test(c) && !bulunan.has(e.taramaId)) bulunan.set(e.taramaId, c);
  const kapsanan = new Set(uretilen.map((e) => e.taramaId)).size;
  kontrol(`tavsiye dili yok (${uretilen.length} eşleşme, ${kapsanan} tarayıcı)`, bulunan.size === 0, [...bulunan].map(([id, c]) => `${id}: ${c}`).join(' | '));
  kontrol('tavsiye taraması bütün tarayıcıları kapsıyor', kapsanan === TARAYICILAR.length, TARAYICILAR.map((t) => t.id).filter((id) => !uretilen.some((e) => e.taramaId === id)).join(', '));
}

// ÇIKTI BİÇİMİ: bütün üretilen eşleşmelerde (sentetik 3000 seri + örnekler) kuruş, hedef yönü, sıra, dil, etiket biçimi.
console.log('çıktı biçimi (tüm üretilen eşleşmeler)');
{
  const ilk = new Map<string, string>();
  const yaz = (tur: string, ornek: string) => { if (!ilk.has(tur)) ilk.set(tur, ornek); };
  // Kuruş: 1'in üstünde 2 ondalık (Math.round(x*100)/100 === x), altında 4 ondalık. Float32 artığı (343.86260986328125) kalmasın.
  const kurusMu = (x: number) => (Math.abs(x) < 1 ? Math.round(x * 10000) / 10000 === x : Math.round(x * 100) / 100 === x);
  const sayiDuz = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));
  for (const e of uretilen) {
    const id = e.taramaId;
    if (!kurusMu(e.fiyat)) yaz('fiyat kuruşa yuvarlanmamış', `${id} ${e.fiyat}`);
    for (const [ad, v] of Object.entries(e.seviyeler ?? {})) if (!kurusMu(v)) yaz('seviye kuruşa yuvarlanmamış', `${id} ${ad}=${v}`);
    for (const q of [...(e.cizim?.noktalar ?? []), ...(e.cizim?.cizgiler ?? []).flatMap((l) => [l.a, l.b])]) if (!kurusMu(q.fiyat)) yaz('çizim fiyatı kuruşa yuvarlanmamış', `${id} ${q.fiyat}`);
    // Hedef yönü: al → fiyat × 1,015 ve üstü; sat → fiyat ÷ 1,015 ve altı; izle → fiyatın %1,5'inden yakın hedef yok.
    const hedefler = Object.entries(e.seviyeler ?? {}).filter(([ad]) => /hedef/i.test(ad));
    for (const [ad, v] of hedefler) {
      const ok = e.yon === 'al' ? v >= e.fiyat * HEDEF_ESIK : e.yon === 'sat' ? v <= e.fiyat / HEDEF_ESIK : v >= e.fiyat * HEDEF_ESIK || v <= e.fiyat / HEDEF_ESIK;
      if (!ok) yaz(`${e.yon} yönünde fiyatın yanlış yanında "hedef"`, `${id} ${ad}=${v} fiyat ${e.fiyat}`);
    }
    // Sıra: hedefler fiyata yakınlık sırasıyla; "Hedef N" numaraları her yönde 1'den başlayıp sırayla artar.
    const uzak = hedefler.map(([, v]) => Math.abs(v - e.fiyat));
    if (uzak.some((u, j) => j > 0 && u < uzak[j - 1])) yaz('hedef listesi fiyata yakınlık sırasında değil', `${id} ${JSON.stringify(hedefler)}`);
    for (const yukari of [true, false]) {
      const no = hedefler.filter(([ad, v]) => /^Hedef \d+/.test(ad) && v > e.fiyat === yukari).map(([ad]) => Number(ad.match(/^Hedef (\d+)/)![1]));
      if (no.some((n, j) => n !== j + 1)) yaz('Hedef numaraları liste sırasıyla aynı değil', `${id} ${JSON.stringify(hedefler)}`);
    }
    if (e.yon === 'al' && hedefler.length && ilkHedef(e) !== hedefler[0][1]) yaz('karnenin ilk hedefi listenin ilk hedefi değil', `${id} ${ilkHedef(e)} / ${hedefler[0][1]}`);
    // Gerekçe: "hedef" geçen cümle parçasında fiyatın yanlış yanında bir fiyat seviyesi yazılmasın (AKFYE: "Yüzde 38,2 hedefi 3,59", fiyat 3,65).
    if (e.yon !== 'izle') for (const c of e.aciklama) for (const parca of c.split(/[.;:] /)) {
      if (!/hedef/i.test(parca)) continue;
      for (const t of parca.match(/\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g) ?? []) {
        const v = sayiDuz(t);
        const yanlis = e.yon === 'al' ? v >= e.fiyat * 0.7 && v < e.fiyat * HEDEF_ESIK : v <= e.fiyat / 0.7 && v > e.fiyat / HEDEF_ESIK;
        if (yanlis) yaz('gerekçede fiyatın yanlış yanında hedef', `${id} [${parca}] fiyat ${e.fiyat}`);
      }
    }
    const metin = e.aciklama.join(' | ');
    // Tahmin dili yok: kural tarif edilir ("kırılırsa yükseliş şartı sağlanır").
    if (/beklen|yön al|al ya da sat/i.test(metin)) yaz('tahmin/emir dili', `${id} ${metin.match(/[^.|]*(beklen|yön al|al ya da sat)[^.|]*/i)?.[0]}`);
    // Etiket/cümle biçimi: seviye adları kısa etiket ("%38,2"), gerekçe cümleleri sesli okunur ("yüzde 38,2").
    for (const ad of Object.keys(e.seviyeler ?? {})) if (/yüzde/i.test(ad)) yaz('seviye etiketinde "yüzde" (etiket "%" ile yazılır)', `${id} ${ad}`);
    if (/%\s?\d/.test(metin)) yaz('gerekçe cümlesinde "%" (cümle "yüzde" ile yazılır)', `${id} ${metin.slice(0, 100)}`);
    if (/yüzde 1(27|61) (için|ve|ile|ya da)/.test(metin)) yaz('ABCD ölçüsü yuvarlak yazılmış (127,2 / 161,8 olmalı)', `${id} ${metin.slice(0, 160)}`);
    // Esnek ABCD: "1 bölü C eşittir K, yani D bölgesi yüzde H" hesapla aynı.
    if (id === 'abcd-esnek') {
      const r = metin.match(/1 bölü (\d+) eşittir (0,\d{4}), yani D bölgesi yüzde (\d+)/);
      if (!r) yaz('esnek ABCD 1/C cümlesi yok', metin.slice(0, 160));
      else if (r[2] !== (1 / Number(r[1])).toFixed(4).replace('.', ',') || Number(r[3]) !== Math.round(10000 / Number(r[1]))) yaz('esnek ABCD 1/C hesabı yanlış', r[0]);
    }
  }
  kontrol(`çıktı biçimi temiz (${uretilen.length} eşleşme)`, ilk.size === 0, '\n    ' + [...ilk].map(([t, o]) => `${t}: ${o}`).join('\n    '));
  kontrol('çıktı biçimi sınaması gerçekten hedefli eşleşme gördü', uretilen.filter((e) => Object.keys(e.seviyeler ?? {}).some((ad) => /hedef/i.test(ad))).length > 1000);
}

console.log(`\n${gecti} geçti, ${hata} hata`);
process.exit(hata ? 1 : 0);
