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
