import type { Mum } from '../tipler';

/** Wilder DMI: +DI, -DI ve ADX. */
export function dmi(m: Mum[], periyot = 14): { artiDI: number[]; eksiDI: number[]; adx: number[] } {
  const n = m.length;
  const artiDI = new Array<number>(n).fill(NaN);
  const eksiDI = new Array<number>(n).fill(NaN);
  const adx = new Array<number>(n).fill(NaN);
  if (n <= periyot * 2) return { artiDI, eksiDI, adx };
  let tr = 0;
  let artiDM = 0;
  let eksiDM = 0;
  const dx: number[] = [];
  for (let i = 1; i < n; i++) {
    const yukari = m[i].y - m[i - 1].y;
    const asagi = m[i - 1].d - m[i].d;
    const pdm = yukari > asagi && yukari > 0 ? yukari : 0;
    const ndm = asagi > yukari && asagi > 0 ? asagi : 0;
    const gercekAralik = Math.max(m[i].y - m[i].d, Math.abs(m[i].y - m[i - 1].k), Math.abs(m[i].d - m[i - 1].k));
    if (i <= periyot) {
      tr += gercekAralik;
      artiDM += pdm;
      eksiDM += ndm;
      if (i < periyot) continue;
    } else {
      tr = tr - tr / periyot + gercekAralik;
      artiDM = artiDM - artiDM / periyot + pdm;
      eksiDM = eksiDM - eksiDM / periyot + ndm;
    }
    const p = tr === 0 ? 0 : (100 * artiDM) / tr;
    const q = tr === 0 ? 0 : (100 * eksiDM) / tr;
    artiDI[i] = p;
    eksiDI[i] = q;
    const d = p + q === 0 ? 0 : (100 * Math.abs(p - q)) / (p + q);
    dx.push(d);
    if (dx.length === periyot) adx[i] = dx.reduce((a, b) => a + b, 0) / periyot;
    else if (dx.length > periyot) adx[i] = (adx[i - 1] * (periyot - 1) + d) / periyot;
  }
  return { artiDI, eksiDI, adx };
}
