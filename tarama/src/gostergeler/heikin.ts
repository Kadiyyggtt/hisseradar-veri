import type { Mum } from '../tipler';

export interface HeikinMum extends Mum {
  renk: 'yesil' | 'kirmizi';
  /** Tek taraflı kuyruk: teyit mumu. Yön kuyruğun tarafı. */
  teyit: 'yukari' | 'asagi' | null;
}

/** Heikin Ashi dönüşümü. Kuyruk ölçüsü gövdenin %5'inden kısaysa "yok" sayılır. */
export function heikin(m: Mum[]): HeikinMum[] {
  const out: HeikinMum[] = [];
  for (let i = 0; i < m.length; i++) {
    const k = (m[i].a + m[i].y + m[i].d + m[i].k) / 4;
    const a = i === 0 ? (m[0].a + m[0].k) / 2 : (out[i - 1].a + out[i - 1].k) / 2;
    const y = Math.max(m[i].y, a, k);
    const d = Math.min(m[i].d, a, k);
    const govde = Math.abs(k - a) || 1e-9;
    const ustKuyruk = y - Math.max(a, k);
    const altKuyruk = Math.min(a, k) - d;
    const esik = Math.max(govde * 0.05, (y - d) * 0.02);
    const ustVar = ustKuyruk > esik;
    const altVar = altKuyruk > esik;
    const renk = k >= a ? 'yesil' : 'kirmizi';
    let teyit: HeikinMum['teyit'] = null;
    if (renk === 'yesil' && ustVar && !altVar) teyit = 'yukari';
    if (renk === 'kirmizi' && altVar && !ustVar) teyit = 'asagi';
    out.push({ t: m[i].t, a, y, d, k, h: m[i].h, renk, teyit });
  }
  return out;
}
