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
 * Saatlikten 4 saatlik: her seans günü İKİ EŞİT parçaya bölünür (ilk yarı, ikinci yarı).
 * BIST seansı 10:00-18:00: Yahoo 8-9 saatlik mum verir; eski "her 4 mumda bir" kuralı
 * 9 mumlu günde 4+4+1 üretip tek mumluk sahte "4 saatlik" çıkarıyordu. ABD 09:30-16:00
 * (7 mum) 4+3 olur. Tek sayıda mumda fazlası ilk yarıya düşer. Günlük sınır aşılmaz.
 */
export function dortSaatlik(saatlik: Mum[]): Mum[] {
  const out: Mum[] = [];
  let gun: Mum[] = [];
  let g = NaN;
  const bosalt = () => {
    if (!gun.length) return;
    const yari = Math.ceil(gun.length / 2);
    out.push(topla(gun.slice(0, yari)));
    if (gun.length > yari) out.push(topla(gun.slice(yari)));
    gun = [];
  };
  for (const m of saatlik) {
    const bu = Math.floor(m.t / 86400);
    if (bu !== g) {
      bosalt();
      g = bu;
    }
    gun.push(m);
  }
  bosalt();
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
