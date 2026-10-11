/** Wilder RSI. */
export function rsi(kapanis: number[], periyot = 14): number[] {
  const out = new Array<number>(kapanis.length).fill(NaN);
  if (kapanis.length <= periyot) return out;
  let kazanc = 0;
  let kayip = 0;
  for (let i = 1; i <= periyot; i++) {
    const f = kapanis[i] - kapanis[i - 1];
    if (f > 0) kazanc += f;
    else kayip -= f;
  }
  let ortK = kazanc / periyot;
  let ortZ = kayip / periyot;
  out[periyot] = ortZ === 0 ? 100 : 100 - 100 / (1 + ortK / ortZ);
  for (let i = periyot + 1; i < kapanis.length; i++) {
    const f = kapanis[i] - kapanis[i - 1];
    ortK = (ortK * (periyot - 1) + Math.max(f, 0)) / periyot;
    ortZ = (ortZ * (periyot - 1) + Math.max(-f, 0)) / periyot;
    out[i] = ortZ === 0 ? 100 : 100 - 100 / (1 + ortK / ortZ);
  }
  return out;
}
