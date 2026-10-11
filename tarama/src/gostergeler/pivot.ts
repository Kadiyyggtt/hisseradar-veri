import type { Mum } from '../tipler';

export interface Pivot {
  i: number;
  fiyat: number;
  tur: 'tepe' | 'dip';
}

/**
 * ZigZag pivotları: en az `yuzde` kadar ters hareket gelmeden yeni pivot
 * sayılmaz. Formasyon tarayıcıları (1-2-3, QM, Wolfe, W, Topuk Dönüşü)
 * hep bu pivotlar üzerinden çalışır.
 */
export function pivotlar(m: Mum[], yuzde = 4): Pivot[] {
  if (m.length < 3) return [];
  const out: Pivot[] = [];
  let yon: 'yukari' | 'asagi' | null = null;
  let ucI = 0;
  let ucF = m[0].k;
  for (let i = 1; i < m.length; i++) {
    const y = m[i].y;
    const d = m[i].d;
    if (yon === null) {
      if (y >= ucF * (1 + yuzde / 100)) {
        out.push({ i: ucI, fiyat: m[ucI].d, tur: 'dip' });
        yon = 'yukari';
        ucI = i;
        ucF = y;
      } else if (d <= ucF * (1 - yuzde / 100)) {
        out.push({ i: ucI, fiyat: m[ucI].y, tur: 'tepe' });
        yon = 'asagi';
        ucI = i;
        ucF = d;
      }
      continue;
    }
    if (yon === 'yukari') {
      if (y > ucF) {
        ucF = y;
        ucI = i;
      } else if (d <= ucF * (1 - yuzde / 100)) {
        out.push({ i: ucI, fiyat: ucF, tur: 'tepe' });
        yon = 'asagi';
        ucF = d;
        ucI = i;
      }
    } else if (d < ucF) {
      ucF = d;
      ucI = i;
    } else if (y >= ucF * (1 + yuzde / 100)) {
      out.push({ i: ucI, fiyat: ucF, tur: 'dip' });
      yon = 'yukari';
      ucF = y;
      ucI = i;
    }
  }
  // Son uç henüz onaylanmadı ama formasyonların "oluşmakta olan" bacağı için gerekli.
  out.push({ i: ucI, fiyat: ucF, tur: yon === 'yukari' ? 'tepe' : 'dip' });
  return out;
}

/** a ile b arasında Fibonacci seviyesi: oran 0.618 → a'dan b'ye doğru %61.8. */
export function fib(a: number, b: number, oran: number): number {
  return a + (b - a) * oran;
}

/** Bir fiyatın a→b aralığını ne kadar geri aldığı (0-1+). */
export function geriAlma(baslangic: number, bitis: number, fiyat: number): number {
  const aralik = bitis - baslangic;
  if (aralik === 0) return 0;
  return (bitis - fiyat) / aralik;
}

/** Fiyat hedefin ±bant yüzdesi içinde mi. */
export function yakin(fiyat: number, hedef: number, bantYuzde = 2): boolean {
  return Math.abs(fiyat - hedef) / hedef <= bantYuzde / 100;
}

/** Son n mumun hacim ortalaması. */
export function hacimOrt(m: Mum[], n = 20, bitis = m.length - 1): number {
  const bas = Math.max(0, bitis - n + 1);
  let t = 0;
  let s = 0;
  for (let i = bas; i <= bitis; i++) {
    t += m[i].h;
    s++;
  }
  return s ? t / s : 0;
}

/** Basit doğrusal regresyon eğimi (y birim / mum). */
export function egim(degerler: number[]): number {
  const n = degerler.length;
  if (n < 2) return 0;
  const ox = (n - 1) / 2;
  let oy = 0;
  for (const v of degerler) oy += v;
  oy /= n;
  let pay = 0;
  let payda = 0;
  for (let i = 0; i < n; i++) {
    pay += (i - ox) * (degerler[i] - oy);
    payda += (i - ox) ** 2;
  }
  return payda === 0 ? 0 : pay / payda;
}
