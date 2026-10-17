import type { Mum, Ortam, Seriler } from './tipler';
import { aylik, dortSaatlik, haftalik } from './gostergeler/periyot';
import { ema } from './gostergeler/ortalama';
import { pivotlar } from './gostergeler/pivot';
import { heikin } from './gostergeler/heikin';
import { rsi } from './gostergeler/rsi';
import { TARAYICILAR } from './stratejiler';
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
  kontrol('üçgen: düz trendde uymamalı', tarayici('ucgenler').tara(seri(mumla(dogrusal(120, 50, 150))), ORTAM) === null);
  // Dikdörtgen: 90-100 arasında 6 tur, son mum 102.
  const d: number[] = [...sabit(30, 95)];
  for (let t = 0; t < 6; t++) d.push(...dogrusal(5, 90, 100), ...dogrusal(5, 100, 90));
  d.push(102);
  const ed = tarayici('dikdortgen').tara(seri(mumla(d, [...sabit(d.length - 1, 1000), 2000], 0.003)), ORTAM);
  kontrol('dikdörtgen kırılımı uymalı', ed !== null && ed.yon === 'al', ed ? ed.yon : 'null');
  // Bayrak: 10 mumda 80→100, 7 mum 100→96 bez, son mum 101.
  const b = [...sabit(50, 80), ...dogrusal(10, 80, 100), ...dogrusal(7, 100, 96), 101];
  const eb = tarayici('bayrak').tara(seri(mumla(b, [...sabit(b.length - 1, 1000), 1800], 0.004)), ORTAM);
  kontrol('bayrak kırılımı uymalı', eb !== null && eb.yon === 'al', eb ? eb.yon : 'null');
  // Fincan-kulp: 60 mumluk U (100→75→100), 8 mumluk kulp 100→95, son mum 102.
  const fk: number[] = [...sabit(40, 100)];
  for (let t = 0; t < 60; t++) fk.push(100 - 25 * Math.sin((Math.PI * t) / 59));
  fk.push(...dogrusal(8, 100, 95), 102);
  const ef = tarayici('fincan-kulp').tara(seri(mumla(fk, [...sabit(fk.length - 1, 1000), 1800], 0.003)), ORTAM);
  kontrol('fincan-kulp boyun kırılımı uymalı', ef !== null && ef.yon === 'al', ef ? ef.yon + ' ' + ef.aciklama[0] : 'null');
  // Alçalan kama: tepeler 100→90, dipler 92→88 (yakınsıyor), son mum üst çizgiyi kırar.
  const ka: number[] = [...sabit(30, 100)];
  for (let t = 0; t < 6; t++) ka.push(...dogrusal(5, 100 - t * 2, 92 - t * 0.8), ...dogrusal(5, 92 - t * 0.8, 100 - (t + 1) * 2));
  ka.push(96);
  const ek = tarayici('kama').tara(seri(mumla(ka, undefined, 0.003)), ORTAM);
  kontrol('alçalan kama kırılımı uymalı', ek !== null && ek.yon === 'al', ek ? ek.yon + ' ' + ek.aciklama[0] : 'null');
  for (const id of ['bes-dalga', 'abcd-klasik']) {
    let ok = true;
    try { tarayici(id).tara(seri(mumla(dalga(400, 100, 15, 90))), ORTAM); } catch (e) { ok = false; console.error(e); }
    kontrol(`${id} hata fırlatmadı`, ok);
  }
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

console.log(`\n${gecti} geçti, ${hata} hata`);
process.exit(hata ? 1 : 0);
