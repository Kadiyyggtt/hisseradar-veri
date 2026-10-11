import type { Tarayici } from '../tipler';
import { heikinTeyit, haftalikCiftOnay, rsiUyumsuzluk } from './araclar';
import { abcdEsnek, ikiliTepeDip, oboTobo, qm, topukDonusu, wolfe } from './formasyonlar';
import { darBayrak, kuyrukluW, yukselenDipler, zirve52 } from './klasik';
import { aySonu, dongu123, sahteCikis, ucBantTesti, yeniDongu } from './maliyet';
import { abcdKlasik, bayrak, besDalga, dikdortgen, fincanKulp, kama, ucgenler } from './sekiller';
import { altinKesisme, aylik510, dugum, ema200, ema200Donus, fibMerdiveni, hisse889, saatlik926, sikisma200, sma30w } from './ortalamalar';

/**
 * Çalışan tarayıcılar. Sıra = uygulamadaki öncelik. Taraması olmayan tek
 * ders Ana Çizgi (öznel, elle çizilir).
 */
export const TARAYICILAR: Tarayici[] = [
  topukDonusu,
  dongu123, sahteCikis, ucBantTesti, yeniDongu, aySonu,
  kuyrukluW, ikiliTepeDip, qm, wolfe, abcdEsnek, oboTobo,
  ucgenler, kama, dikdortgen, bayrak, fincanKulp, besDalga, abcdKlasik,
  ema200, ema200Donus, sma30w, hisse889, saatlik926, dugum, altinKesisme, aylik510, fibMerdiveni, sikisma200,
  heikinTeyit, haftalikCiftOnay, rsiUyumsuzluk,
  yukselenDipler, darBayrak, zirve52,
];
