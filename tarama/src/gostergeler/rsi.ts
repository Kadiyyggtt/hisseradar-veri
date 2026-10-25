/**
 * Wilder RSI. Hiç hareket yoksa (kazanç da kayıp da sıfır) RSI tanımsızdır; 100 yazmak
 * düz seriyi "aşırı alım" gösteriyordu, nötr 50 sayılır.
 */
const rsiDegeri = (ortK: number, ortZ: number) => (ortZ === 0 ? (ortK === 0 ? 50 : 100) : 100 - 100 / (1 + ortK / ortZ));

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
  out[periyot] = rsiDegeri(ortK, ortZ);
  for (let i = periyot + 1; i < kapanis.length; i++) {
    const f = kapanis[i] - kapanis[i - 1];
    ortK = (ortK * (periyot - 1) + Math.max(f, 0)) / periyot;
    ortZ = (ortZ * (periyot - 1) + Math.max(-f, 0)) / periyot;
    out[i] = rsiDegeri(ortK, ortZ);
  }
  return out;
}
