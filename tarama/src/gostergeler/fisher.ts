import type { Mum } from '../tipler';

/** Ehlers Fisher Transform: değer ve bir önceki değer (tetik). */
export function fisher(m: Mum[], periyot = 14): { fish: number[]; tetik: number[] } {
  const n = m.length;
  const fish = new Array<number>(n).fill(NaN);
  const tetik = new Array<number>(n).fill(NaN);
  let deger = 0;
  let onceki = 0;
  for (let i = periyot - 1; i < n; i++) {
    let enY = -Infinity;
    let enD = Infinity;
    for (let j = i - periyot + 1; j <= i; j++) {
      const orta = (m[j].y + m[j].d) / 2;
      if (orta > enY) enY = orta;
      if (orta < enD) enD = orta;
    }
    const orta = (m[i].y + m[i].d) / 2;
    const ham = enY === enD ? 0 : ((orta - enD) / (enY - enD) - 0.5) * 2;
    deger = 0.33 * ham + 0.67 * deger;
    deger = Math.max(-0.999, Math.min(0.999, deger));
    const f = 0.5 * Math.log((1 + deger) / (1 - deger)) + 0.5 * onceki;
    fish[i] = f;
    tetik[i] = onceki;
    onceki = f;
  }
  return { fish, tetik };
}
