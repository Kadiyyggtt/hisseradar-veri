import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { aylik, haftalik } from './gostergeler/periyot';
import { ilkHedef } from './sicil';
import { TARAYICILAR } from './stratejiler';
import type { HisseSicilDosyasi, HisseSicili, HisseSicilKaydi, Mum, Ortam, Seriler, Tarayici } from './tipler';
import { ABD, BIST } from './veri/evren';
import { serileriGetir } from './veri/getir';

/**
 * HİSSE BAZLI SİCİL — `npm run hisse-sicil` (cumartesi, hisse-sicil.yml). Her hisse için
 * günlük tarayıcılar geçmişte gün gün yürütülür; her "yükseliş şartı" kaydedilir ve
 * sonraki SURE_GUN günde ilk hedefe değip değmediğine bakılır. Aynı formasyonun art arda
 * günlerdeki tekrarları tek kayıt sayılır (KUME_GUN).
 *
 * Yalnız günlük veriyle çalışan tarayıcılar; saatlik/haftalık/aylık süzgeçler ve "giriş vermez"
 * araçlar dışarıda (ortalama çizgisi gibi).
 */
export const GUN_SAYISI = 500;
export const SURE_GUN = 30;
export const KUME_GUN = 10;
const DISARIDA = new Set(['saatlik-9-26', 'hisse-8-89', 'endeks-nabzi', 'ay-sonu-taramasi', 'aylik-5-10', 'haftalik-cift-onay', 'sma30w', 'heikin', 'rsi-uyumsuzluk', 'yukselen-dipler', 'ema200', 'altin-kesisme', 'bes-dalga']);
export const GUNLUK_TARAYICILAR: Tarayici[] = TARAYICILAR.filter((t) => !DISARIDA.has(t.id));

/** Endeks nabzı geçmişte bilinmiyor: tarayıcıların ortam şartı pozitif sayılır (yalnız hisse şekli ölçülür). */
const ORTAM: Ortam = { endeksNabzi: { XU100: { pozitif: true, ema8: 1, ema20: 0, t: 0 }, SPX: { pozitif: true, ema8: 1, ema20: 0, t: 0 } } };

/** Saf: günlük mumlardan hissenin sicili. Haftalık/aylık türetilir; saatlik boş (4 saatlik tarayıcılar atlanır). */
export function hisseSicili(sembol: string, piyasa: 'BIST' | 'ABD', gunluk: Mum[], tarayicilar = GUNLUK_TARAYICILAR, gunSayisi = GUN_SAYISI, sureGun = SURE_GUN): HisseSicili {
  const kayitlar: HisseSicilKaydi[] = [];
  const sonGorulme = new Map<string, number>();
  const bas = Math.max(250, gunluk.length - gunSayisi);
  for (let son = bas; son < gunluk.length; son++) {
    const g = gunluk.slice(0, son + 1);
    const s: Seriler = { sembol, piyasa, '1h': [], '4h': [], '1d': g, '1w': haftalik(g), '1mo': aylik(g) };
    for (const t of tarayicilar) {
      let e;
      try { e = t.tara(s, ORTAM); } catch { continue; }
      if (!e || e.yon !== 'al') continue;
      const hedef = ilkHedef(e);
      if (hedef === null) continue;
      const onceki = sonGorulme.get(t.id);
      if (onceki !== undefined && son - onceki <= KUME_GUN) { sonGorulme.set(t.id, son); continue; }
      sonGorulme.set(t.id, son);
      // Sonuç: sonraki sureGun günde en yüksek hedefe değdi mi.
      let sonuc: HisseSicilKaydi['sonuc'] = 'acik';
      let gun: number | undefined;
      for (let j = son + 1; j <= Math.min(gunluk.length - 1, son + sureGun); j++) {
        if (gunluk[j].y >= hedef) { sonuc = 'ulasti'; gun = j - son; break; }
      }
      if (sonuc === 'acik' && gunluk.length - 1 - son >= sureGun) sonuc = 'ulasmadi';
      kayitlar.push({ taramaId: t.id, t: g[son].t, giris: Math.round(e.fiyat * 100) / 100, hedef: Math.round(hedef * 100) / 100, sonuc, ...(gun !== undefined ? { gun } : {}) });
    }
  }
  const kapali = kayitlar.filter((k) => k.sonuc !== 'acik');
  const formasyon: HisseSicili['formasyon'] = {};
  for (const k of kapali) { const o = (formasyon[k.taramaId] ??= { n: 0, u: 0 }); o.n++; if (k.sonuc === 'ulasti') o.u++; }
  return { n: kapali.length, u: kapali.filter((k) => k.sonuc === 'ulasti').length, formasyon, son: kayitlar.slice(-6).reverse() };
}

async function main() {
  const KOK = process.cwd();
  const sinir = Number(process.env.SINIR ?? 0) || Infinity;
  const eszamanli = Number(process.env.ESZAMANLI ?? 3);
  const isler = [...BIST.slice(0, sinir).map((s) => ({ sembol: s, piyasa: 'BIST' as const })), ...ABD.slice(0, sinir).map((s) => ({ sembol: s, piyasa: 'ABD' as const }))];
  const hisseler: HisseSicilDosyasi['hisseler'] = {};
  let sira = 0;
  let bitti = 0;
  const isci = async () => {
    while (sira < isler.length) {
      const is = isler[sira++];
      try {
        const seriler = await serileriGetir(is.sembol, is.piyasa);
        hisseler[`${is.piyasa}:${is.sembol}`] = hisseSicili(is.sembol, is.piyasa, seriler['1d']);
      } catch (hata) {
        console.error(`  ${is.sembol}: ${(hata as Error).message}`);
      }
      bitti++;
      if (bitti % 25 === 0) console.log(`${bitti}/${isler.length}`);
    }
  };
  await Promise.all(Array.from({ length: eszamanli }, isci));
  const dosya: HisseSicilDosyasi = { surum: 1, uretildi: Math.floor(Date.now() / 1000), gunSayisi: GUN_SAYISI, sureGun: SURE_GUN, hisseler };
  const cikti = join(KOK, 'docs', 'tarama');
  mkdirSync(cikti, { recursive: true });
  writeFileSync(join(cikti, 'hisse-sicil.json'), JSON.stringify(dosya));
  const toplam = Object.values(hisseler).reduce((a, h) => a + h.n, 0);
  const ulasan = Object.values(hisseler).reduce((a, h) => a + h.u, 0);
  console.log(`Hisse sicili: ${Object.keys(hisseler).length} hisse, ${toplam} kapanmış kayıt, ${ulasan} hedefe ulaşan (yüzde ${toplam ? Math.round((ulasan * 100) / toplam) : 0}).`);
}

if (process.argv[1]?.endsWith('hisse-sicil.ts')) main().catch((e) => { console.error(e); process.exit(1); });
