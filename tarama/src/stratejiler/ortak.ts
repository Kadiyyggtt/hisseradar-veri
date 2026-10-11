import type { Eslesme, Periyot, Seriler, Yon } from '../tipler';

/** Eşleşme nesnesini tek yerden kur; kartın beklediği alanlar eksik kalmasın. */
export function eslesme(
  s: Seriler,
  taramaId: string,
  periyot: Periyot,
  yon: Yon,
  guven: number,
  aciklama: string[],
  seviyeler?: Record<string, number>,
): Eslesme {
  const m = s[periyot];
  const son = m[m.length - 1];
  return {
    sembol: s.sembol,
    piyasa: s.piyasa,
    taramaId,
    yon,
    guven: Math.round(guven),
    periyot,
    aciklama,
    seviyeler,
    t: son.t,
    fiyat: son.k,
  };
}

export const kapanislar = (m: { k: number }[]) => m.map((x) => x.k);

export function f2(n: number): string {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function yuzde(n: number): string {
  return `%${(n * 100).toFixed(1).replace('.', ',')}`;
}
