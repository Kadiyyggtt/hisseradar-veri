import type { Tarayici } from '../tipler';
import { heikinTeyit, haftalikCiftOnay, rsiUyumsuzluk } from './araclar';
import { abcdEsnek, ikiliTepeDip, oboTobo, qm, topukDonusu, ucluTepeDip, wolfe } from './formasyonlar';
import { bat, butterfly, gartley } from './harmonik';
import { cekic, sabahYildizi, yutan } from './mumlar';
import { darBayrak, kuyrukluW, yukselenDipler, zirve52 } from './klasik';
import { aySonu, dongu123, sahteCikis, ucBantTesti, yeniDongu } from './maliyet';
import { abcdKlasik, bayrak, besDalga, dikdortgen, fincanKulp, kama, tersFincanKulp, ucgenler } from './sekiller';
import { altinKesisme, aylik510, dugum, ema200, ema200Donus, fibMerdiveni, hisse889, saatlik926, sikisma200, sma30w } from './ortalamalar';

/**
 * Çalışan tarayıcılar. Sıra = uygulamadaki öncelik. Taraması olmayan tek
 * ders Ana Çizgi (öznel, elle çizilir).
 */
export const TARAYICILAR: Tarayici[] = [
  topukDonusu,
  dongu123, sahteCikis, ucBantTesti, yeniDongu, aySonu,
  kuyrukluW, ikiliTepeDip, qm, wolfe, abcdEsnek, oboTobo,
  ucgenler, kama, dikdortgen, ucluTepeDip, bayrak, fincanKulp, tersFincanKulp, besDalga, abcdKlasik, gartley, bat, butterfly,
  yutan, cekic, sabahYildizi,
  ema200, ema200Donus, sma30w, hisse889, saatlik926, dugum, altinKesisme, aylik510, fibMerdiveni, sikisma200,
  heikinTeyit, haftalikCiftOnay, rsiUyumsuzluk,
  yukselenDipler, darBayrak, zirve52,
];

/**
 * Kısa geçmişli hisse (yeni halka arz, 60..249 günlük mum): yalnız kısa seriyle anlamlı
 * çalışan tarayıcılar koşar. Listede olmayan tarayıcı 250 mum ister (200 günlük ortalama,
 * aylık/haftalık döngüler). Değer, tarayıcının kendi içindeki uzunluk koruması kadardır.
 * (Tarayici tipine alan eklemek iki depodaki tipler.ts'yi ayırırdı; o yüzden ayrı tablo.)
 */
export const TARAYICI_EN_AZ_MUM: Record<string, number> = {
  yutan: 60, cekic: 60, 'sabah-yildizi': 60, heikin: 60, 'rsi-uyumsuzluk': 60, 'kuyruklu-w': 60,
  bayrak: 60, 'k-dar-bayrak': 60, 'ikili-tepe-dip': 60, qm: 60, wolfe: 60, 'abcd-esnek': 60, 'abcd-klasik': 60,
  'obo-tobo': 60, 'uclu-tepe-dip': 60, 'yukselen-dipler': 60, dugum: 60,
  ucgenler: 80, kama: 80, dikdortgen: 80, 'fincan-kulp': 80, 'ters-fincan-kulp': 80, 'topuk-donusu': 80,
  gartley: 100, bat: 100, butterfly: 100, 'bes-dalga': 100,
};
export const VARSAYILAN_EN_AZ_MUM = 250;
export const enAzMum = (t: Tarayici) => TARAYICI_EN_AZ_MUM[t.id] ?? VARSAYILAN_EN_AZ_MUM;
