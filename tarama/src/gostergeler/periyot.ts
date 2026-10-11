import type { Mum } from '../tipler';

function topla(grup: Mum[]): Mum {
  return {
    t: grup[0].t,
    a: grup[0].a,
    y: Math.max(...grup.map((m) => m.y)),
    d: Math.min(...grup.map((m) => m.d)),
    k: grup[grup.length - 1].k,
    h: grup.reduce((s, m) => s + m.h, 0),
  };
}

/** Günlükten haftalık: ISO hafta (Pazartesi başlangıç). */
export function haftalik(gunluk: Mum[]): Mum[] {
  return grupla(gunluk, (t) => {
    const d = new Date(t * 1000);
    const gun = (d.getUTCDay() + 6) % 7; // Pzt=0
    const pzt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - gun));
    return pzt.getTime();
  });
}

/** Günlükten aylık. */
export function aylik(gunluk: Mum[]): Mum[] {
  return grupla(gunluk, (t) => {
    const d = new Date(t * 1000);
    return d.getUTCFullYear() * 100 + d.getUTCMonth();
  });
}

/**
 * Saatlikten 4 saatlik: seans içi saat dilimleri (piyasa açılışından
 * itibaren her 4 mum). BIST seansı 10:00-18:00 (8 saat → 2 mum/gün),
 * ABD 09:30-16:00 (6,5 saat → 2 mum/gün). Günlük sınır aşılmaz.
 */
export function dortSaatlik(saatlik: Mum[]): Mum[] {
  const out: Mum[] = [];
  let grup: Mum[] = [];
  let gun = -1;
  for (const m of saatlik) {
    const g = Math.floor(m.t / 86400);
    if (g !== gun || grup.length === 4) {
      if (grup.length) out.push(topla(grup));
      grup = [];
      gun = g;
    }
    grup.push(m);
  }
  if (grup.length) out.push(topla(grup));
  return out;
}

function grupla(m: Mum[], anahtar: (t: number) => number): Mum[] {
  const out: Mum[] = [];
  let grup: Mum[] = [];
  let son = NaN;
  for (const x of m) {
    const a = anahtar(x.t);
    if (a !== son && grup.length) {
      out.push(topla(grup));
      grup = [];
    }
    son = a;
    grup.push(x);
  }
  if (grup.length) out.push(topla(grup));
  return out;
}
