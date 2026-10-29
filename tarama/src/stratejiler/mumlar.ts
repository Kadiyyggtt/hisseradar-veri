import type { Mum, Seriler, Tarayici } from '../tipler';
import { ema } from '../gostergeler/ortalama';
import { hacimOrt } from '../gostergeler/pivot';
import { eslesme, f2, iyelikEki, kapanislar } from './ortak';

/**
 * MUM FORMASYONLARI — tek ya da üç mumluk dönüş kalıpları. Bağlam şart:
 * yükseliş kalıbı ancak düşüşten sonra (fiyat EMA 20 altında ya da son 10 mumun
 * dibi), düşüş kalıbı yükselişten sonra anlam taşır. Hepsi günlük mumda, A sınıfı:
 * ölçüler nettir. Teyit mumu gelince yön "al/sat", gelmeden "izle".
 */
const govde = (m: Mum) => Math.abs(m.k - m.a);
const ustFitil = (m: Mum) => m.y - Math.max(m.a, m.k);
const altFitil = (m: Mum) => Math.min(m.a, m.k) - m.d;
const yesil = (m: Mum) => m.k > m.a;
const kirmizi = (m: Mum) => m.k < m.a;

/** Ortalama gövde (son n mum, son mum hariç). */
function ortGovde(m: Mum[], i: number, n = 10): number {
  let t = 0;
  for (let j = i - n; j < i; j++) t += govde(m[j]);
  return t / n || 1e-9;
}

/** Bağlam: düşüş sonrası mı (al kalıpları için), yükseliş sonrası mı (sat kalıpları için). */
function baglam(m: Mum[], i: number): { dususSonrasi: boolean; yukselisSonrasi: boolean; e20: number } {
  const e = ema(kapanislar(m), 20);
  const e20 = e[i - 1];
  const enDusuk10 = Math.min(...m.slice(i - 10, i).map((x) => x.d));
  const enYuksek10 = Math.max(...m.slice(i - 10, i).map((x) => x.y));
  // İki şart birden: ortalamanın altında VE son 10 günün dibinde. Tek şart her gün onlarca "mum" üretiyordu (24 Ekim canlı: 64 çekiç).
  return {
    dususSonrasi: m[i - 1].k < e20 && m[i].d <= enDusuk10,
    yukselisSonrasi: m[i - 1].k > e20 && m[i].y >= enYuksek10,
    e20,
  };
}

/** Yutan mum: bugünün gövdesi dünün gövdesini iki uçtan sarar, renk ters, gövde ortalamanın en az 1,2 katı. */
function yutanTara(s: Seriler) {
  const m = s['1d'];
  const i = m.length - 1;
  if (i < 40) return null;
  // Teyit: dün yutan, bugün aynı yönde kapanış → al/sat. Bugün yutan → izle.
  for (const [gun, teyitli] of [[i - 1, true], [i, false]] as const) {
    const o = m[gun - 1];
    const b = m[gun];
    const og = govde(o);
    const bg = govde(b);
    if (og === 0 || bg < ortGovde(m, gun) * 1.2) continue;
    const bogaYutan = kirmizi(o) && yesil(b) && b.a <= o.k && b.k >= o.a && bg > og;
    const ayiYutan = yesil(o) && kirmizi(b) && b.a >= o.k && b.k <= o.a && bg > og;
    if (!bogaYutan && !ayiYutan) continue;
    const { dususSonrasi, yukselisSonrasi, e20 } = baglam(m, gun);
    if (bogaYutan && !dususSonrasi) continue;
    if (ayiYutan && !yukselisSonrasi) continue;
    const teyit = teyitli && (bogaYutan ? m[i].k > b.k : m[i].k < b.k);
    if (teyitli && !teyit) continue;
    const kat = b.h / (hacimOrt(m, 20, gun - 1) || 1);
    const boy = b.y - b.d;
    const yon = bogaYutan ? 1 : -1;
    const guven = 50 + (teyit ? 20 : 0) + (kat >= 1.5 ? 15 : 0) + (bg > og * 1.5 ? 10 : 0);
    return eslesme(s, 'yutan', '1d', teyit ? (bogaYutan ? 'al' : 'sat') : 'izle', guven,
      [`${bogaYutan ? 'Boğa' : 'Ayı'} yutan mum${teyitli ? ' (bir önceki mum)' : ' (son kapanan mum)'}: ${bogaYutan ? 'kırmızı' : 'yeşil'} mumun ardından gövdesi onu iki uçtan saran ${bogaYutan ? 'yeşil' : 'kırmızı'} mum. Gövde önceki gövdenin ${(bg / og).toFixed(1).replace('.', ',')} katı, son 10 günün ortalamasının ${(bg / ortGovde(m, gun)).toFixed(1).replace('.', ',')} katı.`,
       `Bağlam: ${bogaYutan ? 'düşüş sonrası' : 'yükseliş sonrası'}; fiyat EMA 20 (${f2(e20)}) ${m[gun - 1].k < e20 ? 'altında' : 'üstünde'}. Hacim 20 günlük ortalamanın ${kat.toFixed(1).replace('.', ',')} katı.`,
       teyit ? `Son kapanış ${bogaYutan ? 'yutan mumun üstünde' : 'yutan mumun altında'} geldi: Teyit tamam, ${bogaYutan ? 'yükseliş' : 'düşüş'} şartı sağlandı.` : 'Teyit henüz yok: Kural, ertesi gün kalıbın yönünde kapanış ister; tek mum yeterli sayılmaz.',
       `Stop ${bogaYutan ? 'yutan mumun dibi' : 'yutan mumun tepesi'} ${f2(bogaYutan ? b.d : b.y)}; hedef mum boyunun (${f2(boy)}) bir ve iki katı.`],
      { [bogaYutan ? 'Stop (mum dibi)' : 'Stop (mum tepesi)']: bogaYutan ? b.d : b.y, 'Hedef 1 (bir boy)': b.k + yon * boy, 'Hedef 2 (iki boy)': b.k + yon * 2 * boy });
  }
  return null;
}

/** Çekiç (dipte) ve kayan yıldız (tepede): tek taraflı uzun fitil, küçük gövde uçta. */
function cekicTara(s: Seriler) {
  const m = s['1d'];
  const i = m.length - 1;
  if (i < 40) return null;
  for (const [gun, teyitli] of [[i - 1, true], [i, false]] as const) {
    const b = m[gun];
    const boy = b.y - b.d;
    const g = govde(b);
    if (boy <= 0 || boy < ortGovde(m, gun) * 1.2) continue;
    const alt = altFitil(b);
    const ust = ustFitil(b);
    const cekic = alt >= 2 * Math.max(g, boy * 0.1) && ust <= boy * 0.15 && Math.min(b.a, b.k) >= b.d + boy * 0.6;
    const yildiz = ust >= 2 * Math.max(g, boy * 0.1) && alt <= boy * 0.15 && Math.max(b.a, b.k) <= b.d + boy * 0.4;
    if (!cekic && !yildiz) continue;
    const { dususSonrasi, yukselisSonrasi } = baglam(m, gun);
    if (cekic && !dususSonrasi) continue;
    if (yildiz && !yukselisSonrasi) continue;
    const teyit = teyitli && (cekic ? m[i].k > b.y : m[i].k < b.d);
    if (teyitli && !teyit) continue;
    const kat = b.h / (hacimOrt(m, 20, gun - 1) || 1);
    const yon = cekic ? 1 : -1;
    const guven = 50 + (teyit ? 20 : 0) + (kat >= 1.5 ? 15 : 0) + ((cekic ? alt : ust) >= 3 * Math.max(g, boy * 0.1) ? 10 : 0);
    const fitil = cekic ? alt : ust;
    return eslesme(s, 'cekic', '1d', teyit ? (cekic ? 'al' : 'sat') : 'izle', guven,
      [`${cekic ? 'Çekiç' : 'Kayan yıldız'}${teyitli ? ' (bir önceki mum)' : ' (son kapanan mum)'}: ${cekic ? 'alt' : 'üst'} fitil ${f2(fitil)}, gövdenin ${g > 0 ? (fitil / g).toFixed(1).replace('.', ',') : '∞'} katı; karşı fitil neredeyse yok. Gövde mumun ${cekic ? 'üst' : 'alt'} ucunda.`,
       `Bağlam: ${cekic ? 'Düşüşün dibinde, gün içi satış geldi ama kapanış yukarıda tutuldu' : 'Yükselişin tepesinde, gün içi alış geldi ama kapanış aşağıda kaldı'}. Hacim 20 günlük ortalamanın ${kat.toFixed(1).replace('.', ',')} katı.`,
       teyit ? `Son kapanış ${cekic ? 'çekicin tepesinin üstünde' : 'yıldızın dibinin altında'}: Teyit tamam, ${cekic ? 'yükseliş' : 'düşüş'} şartı sağlandı.` : `Teyit henüz yok: Kural, ${cekic ? 'çekicin tepesinin' : 'yıldızın dibinin'} (${f2(cekic ? b.y : b.d)}) kapanışla geçilmesini şart sayar.`,
       `Stop ${cekic ? 'fitilin dibi' : 'fitilin tepesi'} ${f2(cekic ? b.d : b.y)}; hedef mum boyunun bir ve iki katı.`],
      { [cekic ? 'Stop (fitil dibi)' : 'Stop (fitil tepesi)']: cekic ? b.d : b.y, 'Hedef 1 (bir boy)': (cekic ? b.y : b.d) + yon * boy, 'Hedef 2 (iki boy)': (cekic ? b.y : b.d) + yon * 2 * boy });
  }
  return null;
}

/** Sabah yıldızı (dipte) ve akşam yıldızı (tepede): uzun mum, küçük gövdeli ara mum, ters yönde ilk mumun ortasını geçen üçüncü mum. */
function sabahYildiziTara(s: Seriler) {
  const m = s['1d'];
  const i = m.length - 1;
  if (i < 40) return null;
  const [m1, m2, m3] = [m[i - 2], m[i - 1], m[i]];
  const ort = ortGovde(m, i - 2);
  const g1 = govde(m1);
  const g2 = govde(m2);
  const g3 = govde(m3);
  if (g1 < ort * 1.3 || g2 > g1 * 0.35 || g3 < ort * 0.8) return null;
  const orta1 = (m1.a + m1.k) / 2;
  const sabah = kirmizi(m1) && yesil(m3) && m3.k > orta1 && Math.max(m2.a, m2.k) <= m1.k + g1 * 0.25;
  const aksam = yesil(m1) && kirmizi(m3) && m3.k < orta1 && Math.min(m2.a, m2.k) >= m1.k - g1 * 0.25;
  if (!sabah && !aksam) return null;
  const { dususSonrasi, yukselisSonrasi, e20 } = baglam(m, i - 2);
  if (sabah && !dususSonrasi) return null;
  if (aksam && !yukselisSonrasi) return null;
  const kat = m3.h / (hacimOrt(m, 20, i - 3) || 1);
  const dip = Math.min(m1.d, m2.d, m3.d);
  const tepe = Math.max(m1.y, m2.y, m3.y);
  const boy = tepe - dip;
  const yon = sabah ? 1 : -1;
  const tamGeri = sabah ? m3.k >= m1.a : m3.k <= m1.a;
  const guven = 60 + (kat >= 1.5 ? 15 : 0) + (tamGeri ? 15 : 0);
  const yildizYuzde = Math.round((g2 / g1) * 100);
  return eslesme(s, 'sabah-yildizi', '1d', sabah ? 'al' : 'sat', guven,
    [`${sabah ? 'Sabah' : 'Akşam'} yıldızı: ${sabah ? 'Uzun kırmızı' : 'Uzun yeşil'} mum (gövde ortalamanın ${(g1 / ort).toFixed(1).replace('.', ',')} katı), ardından küçük gövdeli yıldız (ilk gövdenin yüzde ${yildizYuzde}${iyelikEki(yildizYuzde)}), sonra ${sabah ? 'yeşil' : 'kırmızı'} mum ilk mumun ortasını (${f2(orta1)}) ${sabah ? 'yukarı' : 'aşağı'} geçti${tamGeri ? ' ve ilk mumu tamamen geri aldı' : ''}.`,
     `Bağlam: ${sabah ? 'düşüş sonrası' : 'yükseliş sonrası'}; ilk mum öncesi kapanış EMA 20 (${f2(e20)}) ${m[i - 3].k < e20 ? 'altında' : 'üstünde'}. Üçüncü mumun hacmi 20 günlük ortalamanın ${kat.toFixed(1).replace('.', ',')} katı.`,
     `Üç mum tamamlandığı için kalıp kendi teyidini içerir: ${sabah ? 'Yükseliş' : 'Düşüş'} şartı sağlandı. Stop ${sabah ? 'yıldızın dibi' : 'yıldızın tepesi'} ${f2(sabah ? dip : tepe)}.`,
     `Hedef: Üç mumun toplam boyu (${f2(boy)}) üçüncü mumun kapanışına eklenir; ikinci hedef iki boy.`],
    { [sabah ? 'Stop (yıldız dibi)' : 'Stop (yıldız tepesi)']: sabah ? dip : tepe, 'Hedef 1 (bir boy)': m3.k + yon * boy, 'Hedef 2 (iki boy)': m3.k + yon * 2 * boy });
}

export const yutan: Tarayici = { id: 'yutan', tara: yutanTara };
export const cekic: Tarayici = { id: 'cekic', tara: cekicTara };
export const sabahYildizi: Tarayici = { id: 'sabah-yildizi', tara: sabahYildiziTara };
