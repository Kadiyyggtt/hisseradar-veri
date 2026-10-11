/** Üssel hareketli ortalama. Eksik veride NaN döner, dizinin boyu korunur. */
export function ema(degerler: number[], periyot: number): number[] {
  const k = 2 / (periyot + 1);
  const out = new Array<number>(degerler.length).fill(NaN);
  if (degerler.length < periyot) return out;
  let toplam = 0;
  for (let i = 0; i < periyot; i++) toplam += degerler[i];
  let onceki = toplam / periyot;
  out[periyot - 1] = onceki;
  for (let i = periyot; i < degerler.length; i++) {
    onceki = degerler[i] * k + onceki * (1 - k);
    out[i] = onceki;
  }
  return out;
}

/** Basit hareketli ortalama. */
export function sma(degerler: number[], periyot: number): number[] {
  const out = new Array<number>(degerler.length).fill(NaN);
  let toplam = 0;
  for (let i = 0; i < degerler.length; i++) {
    toplam += degerler[i];
    if (i >= periyot) toplam -= degerler[i - periyot];
    if (i >= periyot - 1) out[i] = toplam / periyot;
  }
  return out;
}

/** Son mumda a, b'yi yukarı kesti mi (bir önceki mumda altındaydı). */
export function yukariKesti(a: number[], b: number[], i = a.length - 1): boolean {
  if (i < 1) return false;
  return a[i - 1] <= b[i - 1] && a[i] > b[i] && Number.isFinite(a[i - 1]) && Number.isFinite(b[i - 1]);
}

export function asagiKesti(a: number[], b: number[], i = a.length - 1): boolean {
  if (i < 1) return false;
  return a[i - 1] >= b[i - 1] && a[i] < b[i] && Number.isFinite(a[i - 1]) && Number.isFinite(b[i - 1]);
}

/** Son `bar` mum içinde yukarı kesişme olduysa kaç mum önce olduğunu döner, yoksa -1. */
export function sonYukariKesisme(a: number[], b: number[], bar: number): number {
  for (let g = 0; g < bar; g++) {
    const i = a.length - 1 - g;
    if (i < 1) break;
    if (yukariKesti(a, b, i)) return g;
  }
  return -1;
}
