import type { CizimCizgi, CizimNokta, Eslesme, EslesmeCizimi, Mum, Periyot, Seriler, Yon } from '../tipler';

/**
 * Eşleşme nesnesini tek yerden kur; kartın beklediği alanlar eksik kalmasın.
 * Bozuk veride (son kapanış NaN, sıfır ya da eksi) eşleşme yok: uygulama sıfır
 * fiyatlı kart göstermesin. Sıfır/eksi/sonsuz seviyeler atılır; "iki boy aşağı"
 * gibi ölçümler küçük fiyatlı hissede sıfırın altına düşebiliyor (denetim: 44 kayıt).
 */
export function eslesme(
  s: Seriler,
  taramaId: string,
  periyot: Periyot,
  yon: Yon,
  guven: number,
  aciklama: string[],
  seviyeler?: Record<string, number>,
  cizim?: EslesmeCizimi,
): Eslesme | null {
  const m = s[periyot];
  const son = m[m.length - 1];
  if (!son || !Number.isFinite(son.k) || son.k <= 0 || !Number.isFinite(son.t)) return null;
  if (!Number.isFinite(guven)) return null;
  // Gerekçede NaN/Infinity çıkıyorsa ölçüm bozuk veriden gelmiştir (sıfır fiyatlı mum: "yüzde Infinity yükseliş").
  if (aciklama.some((x) => /NaN|Infinity|undefined/.test(x))) return null;
  let temiz: Record<string, number> | undefined;
  if (seviyeler) {
    temiz = {};
    for (const [ad, v] of Object.entries(seviyeler)) if (Number.isFinite(v) && v > 0) temiz[ad] = v;
  }
  let temizCizim: EslesmeCizimi | undefined;
  if (cizim) {
    // Çizimde sıfır/eksi fiyatlı ya da sonlu olmayan uç varsa o parça çizilmez (grafik ekseni bozulmasın).
    const gecerli = (q: CizimNokta) => Number.isInteger(q.g) && q.g >= 0 && q.g < m.length && Number.isFinite(q.fiyat) && q.fiyat > 0;
    const noktalar = cizim.noktalar?.filter(gecerli);
    const cizgiler = cizim.cizgiler?.filter((l) => gecerli(l.a) && gecerli(l.b));
    if (noktalar?.length || cizgiler?.length) temizCizim = { ...cizim, ...(noktalar ? { noktalar } : {}), ...(cizgiler ? { cizgiler } : {}) };
  }
  return {
    ...(temizCizim ? { cizim: temizCizim } : {}),
    sembol: s.sembol,
    piyasa: s.piyasa,
    taramaId,
    yon,
    guven: Math.max(0, Math.min(100, Math.round(guven))),
    periyot,
    aciklama,
    seviyeler: temiz,
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

/**
 * SAYIYA GELEN EK — Türkçede ek, sayının OKUNUŞUNA göre gelir:
 * 32 "otuz iki" → 32'si, 41 "kırk bir" → 41'i, 50 "elli" → 50'si, 100 "yüz" → 100'ü, 3 "üç" → 3'ü.
 * Yalnız iyelik/belirtme eki ("-i/-si") için; "yüzde 32'si kadar" gibi.
 */
export function iyelikEki(n: number): string {
  const son = Math.abs(Math.round(n));
  const birler = son % 10;
  const onlar = son % 100;
  // Son söylenen sözcük: birler basamağı sıfırsa onlar/yüzler/binler sözcüğü okunur.
  let sozcuk: string;
  if (birler !== 0) sozcuk = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'][birler];
  else if (onlar !== 0) sozcuk = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'][onlar / 10];
  else if (son % 1000 !== 0) sozcuk = 'yüz';
  else sozcuk = 'bin';
  const unluyleBitiyor = /[aeıioöuü]$/.test(sozcuk);
  const sonUnlu = sozcuk.match(/[aeıioöuü](?=[^aeıioöuü]*$)/)?.[0] ?? 'i';
  const ek = 'ıi'.includes(sonUnlu) || 'ae'.includes(sonUnlu) ? ('aı'.includes(sonUnlu) ? 'ı' : 'i') : ('ou'.includes(sonUnlu) ? 'u' : 'ü');
  return (unluyleBitiyor ? "'s" : "'") + ek;
}

/** Belirtme eki ("-ini/-ını/-unu/-ünü"): "yüzde 30'unu geri aldı". İyelik ekinin üstüne -n- ve aynı ünlü gelir. */
export function belirtmeEki(n: number): string {
  const iyelik = iyelikEki(n);
  return iyelik + 'n' + iyelik.slice(-1);
}

/** Çizim noktası: mum sırası i → son mumdan geriye sayım. Fiyat iki ondalığa yuvarlanır. */
export function nokta(m: Mum[], i: number, fiyat: number, ad: string): CizimNokta {
  return { g: Math.max(0, m.length - 1 - Math.round(i)), fiyat: Math.round(fiyat * 100) / 100, ad };
}

export function cizgi(a: CizimNokta, b: CizimNokta, tur: CizimCizgi['tur'] = 'trend'): CizimCizgi {
  return { a, b, tur };
}

/** Ardışık noktaları bacak çizgileriyle bağla (X-A-B-C-D, 1-2-3-4-5). */
export function bacaklar(n: CizimNokta[]): CizimCizgi[] {
  const out: CizimCizgi[] = [];
  for (let i = 1; i < n.length; i++) out.push(cizgi(n[i - 1], n[i], 'bacak'));
  return out;
}
