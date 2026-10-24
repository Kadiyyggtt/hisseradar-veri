import type { Seriler, Tarayici } from '../tipler';
import { pivotlar } from '../gostergeler/pivot';
import { bacaklar, cizgi, eslesme, f2, nokta } from './ortak';

/**
 * HARMONİK FORMASYONLAR — Gartley, Bat, Butterfly. Beş pivot: X, A, B, C, D.
 * Her bacak Fibonacci oranıyla ölçülür; D noktası "dönüş bölgesi"dir
 * (potential reversal zone). Yükseliş kalıbı M biçimindedir: X dip, A tepe,
 * B dip, C tepe, D dip → D'de alış aranır. Düşüş kalıbı aynanın tersidir.
 *
 * Oranlar (ABD ve BIST'te aynı; toleranslar yüzde puan olarak):
 *   Gartley   B = 0,618 XA (±5)   C = 0,382-0,886 AB   D = 0,786 XA (±3)
 *   Bat       B = 0,382-0,50 XA   C = 0,382-0,886 AB   D = 0,886 XA (±3)
 *   Butterfly B = 0,786 XA (±5)   C = 0,382-0,886 AB   D = 1,272-1,618 XA (X'in ötesi)
 * B sınıfı: pivotlar yaklaşıktır; D bölgesine fiyat yüzde 2,5 bant içinde gelmiş olmalı.
 */
interface Kalip {
  id: string;
  ad: string;
  b: [number, number];
  c: [number, number];
  d: [number, number];
  /** D, X'in ötesine taşar (Butterfly). */
  tasar: boolean;
}

const KALIPLAR: Kalip[] = [
  { id: 'gartley', ad: 'Gartley', b: [0.568, 0.668], c: [0.382, 0.886], d: [0.756, 0.816], tasar: false },
  { id: 'bat', ad: 'Bat', b: [0.352, 0.53], c: [0.382, 0.886], d: [0.856, 0.916], tasar: false },
  { id: 'butterfly', ad: 'Butterfly', b: [0.736, 0.836], c: [0.382, 0.886], d: [1.242, 1.648], tasar: true },
];

const icinde = (v: number, [alt, ust]: [number, number]) => v >= alt && v <= ust;
const yuzdeYaz = (o: number) => `yüzde ${(o * 100).toFixed(1).replace('.', ',')}`;

function harmonikTara(s: Seriler, kalip: Kalip) {
  const m = s['1d'];
  const i = m.length - 1;
  if (i < 100) return null;
  const bas = Math.max(0, i - 150);
  const p = pivotlar(m.slice(bas), 4).map((q) => ({ ...q, i: q.i + bas }));
  if (p.length < 5) return null;
  const [X, A, B, C, D] = p.slice(-5);
  if (i - D.i > 3) return null;
  const yukselis = X.tur === 'dip' && A.tur === 'tepe' && B.tur === 'dip' && C.tur === 'tepe' && D.tur === 'dip';
  const dusus = X.tur === 'tepe' && A.tur === 'dip' && B.tur === 'tepe' && C.tur === 'dip' && D.tur === 'tepe';
  if (!yukselis && !dusus) return null;
  const xa = Math.abs(A.fiyat - X.fiyat);
  const ab = Math.abs(B.fiyat - A.fiyat);
  const bc = Math.abs(C.fiyat - B.fiyat);
  if (xa === 0 || ab === 0) return null;
  const bOran = ab / xa;
  const cOran = bc / ab;
  if (!icinde(bOran, kalip.b) || !icinde(cOran, kalip.c)) return null;
  // D bölgesi: XA'nın geri alma (ya da taşma) oranı. Yükselişte A'dan aşağı ölçülür.
  const yon = yukselis ? 1 : -1;
  const dHedef = (oran: number) => A.fiyat - yon * xa * oran;
  const dAlt = dHedef(kalip.d[0]);
  const dUst = dHedef(kalip.d[1]);
  const dBolgeAlt = Math.min(dAlt, dUst);
  const dBolgeUst = Math.max(dAlt, dUst);
  const uc = yukselis ? Math.min(D.fiyat, m[i].d) : Math.max(D.fiyat, m[i].y);
  const bant = xa * 0.03;
  if (uc < dBolgeAlt - bant || uc > dBolgeUst + bant) return null;
  // Butterfly'da D, X'i geçmiş olmalı; diğerlerinde geçmemeli.
  const xGecti = yukselis ? uc < X.fiyat : uc > X.fiyat;
  if (kalip.tasar !== xGecti) return null;
  const dOran = Math.abs(A.fiyat - uc) / xa;
  const donus = yukselis ? m[i].k > m[i - 1].k && m[i].k > m[i].a : m[i].k < m[i - 1].k && m[i].k < m[i].a;
  const ad = Math.abs(uc - A.fiyat);
  const hedef1 = uc + yon * ad * 0.382;
  const hedef2 = uc + yon * ad * 0.618;
  const stop = kalip.tasar ? uc - yon * xa * 0.13 : X.fiyat;
  const guven = 55 + (donus ? 20 : 0) + (icinde(dOran, kalip.d) ? 10 : 0);
  const yonAd = yukselis ? 'Yükseliş' : 'Düşüş';
  return eslesme(s, kalip.id, '1d', donus ? (yukselis ? 'al' : 'sat') : 'izle', guven,
    [`${yonAd} ${kalip.ad}: X ${f2(X.fiyat)}, A ${f2(A.fiyat)}, B ${f2(B.fiyat)}, C ${f2(C.fiyat)}, D ${f2(uc)}.`,
     `B noktası XA bacağının ${yuzdeYaz(bOran)}${yuzdeEki(bOran)}ni geri aldı; C noktası AB'nin ${yuzdeYaz(cOran)}${yuzdeEki(cOran)}ni. İkisi de ${kalip.ad} oranlarında.`,
     `D noktası XA'nın ${yuzdeYaz(dOran)}${yuzdeEki(dOran)}nde: dönüş bölgesi ${f2(dBolgeAlt)} ile ${f2(dBolgeUst)} arası${kalip.tasar ? ", X'in ötesinde" : ''}.`,
     donus ? `Son mum ${yukselis ? 'yukarı' : 'aşağı'} döndü. ${yukselis ? 'Alış' : 'Satış'} şartı sağlandı; stop ${f2(stop)}.` : 'Dönüş mumu bekleniyor; bölgeye gelmek tek başına giriş değildir.'],
    { 'D bölgesi': uc, 'Hedef 1 (AD %38,2)': hedef1, 'Hedef 2 (AD %61,8)': hedef2, [kalip.tasar ? 'Stop (D ötesi)' : 'Stop (X)']: stop },
    (() => {
      const n = [nokta(m, X.i, X.fiyat, 'X'), nokta(m, A.i, A.fiyat, 'A'), nokta(m, B.i, B.fiyat, 'B'), nokta(m, C.i, C.fiyat, 'C'), nokta(m, D.i, uc, 'D')];
      return { noktalar: n, cizgiler: [...bacaklar(n), cizgi(n[0], n[2]), cizgi(n[2], n[4])] };
    })());
}

/** "yüzde 61,8'ini" için ek: oran yüzdesinin okunuşuna göre. Basit tutuldu: ondalıklı sayılar "-ini", tam onlarda "-sini/-ünü" vb. */
function yuzdeEki(oran: number): string {
  const y = Math.round(oran * 1000) / 10;
  if (!Number.isInteger(y)) {
    const ondalik = Math.round((y % 1) * 10);
    return ["'ını", "'ini", "'sini", "'ünü", "'ünü", "'ini", "'sını", "'sini", "'ini", "'unu"][ondalik] ?? "'ini";
  }
  const son = y % 10;
  if (son !== 0) return ["", "'ini", "'sini", "'ünü", "'ünü", "'ini", "'sını", "'sini", "'ini", "'unu"][son];
  const onlar = (y % 100) / 10;
  return ["'ünü", "'unu", "'sini", "'unu", "'ını", "'sini", "'ını", "'ini", "'ini", "'ını"][onlar] ?? "'ini";
}

export const gartley: Tarayici = { id: 'gartley', tara: (s) => harmonikTara(s, KALIPLAR[0]) };
export const bat: Tarayici = { id: 'bat', tara: (s) => harmonikTara(s, KALIPLAR[1]) };
export const butterfly: Tarayici = { id: 'butterfly', tara: (s) => harmonikTara(s, KALIPLAR[2]) };
