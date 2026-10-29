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
  const fiyat = kurus(son.k);
  let temiz: Record<string, number> | undefined;
  if (seviyeler) {
    temiz = {};
    for (const [ad, v] of Object.entries(seviyeler)) if (Number.isFinite(v) && v > 0 && kurus(v) > 0) temiz[ad] = kurus(v);
    temiz = hedefleriSuz(temiz, yon, fiyat);
  }
  let temizCizim: EslesmeCizimi | undefined;
  if (cizim) {
    // Çizimde sıfır/eksi fiyatlı ya da sonlu olmayan uç varsa o parça çizilmez (grafik ekseni bozulmasın).
    const gecerli = (q: CizimNokta) => Number.isInteger(q.g) && q.g >= 0 && q.g < m.length && Number.isFinite(q.fiyat) && kurus(q.fiyat) > 0;
    const yuvarla = (q: CizimNokta): CizimNokta => ({ ...q, fiyat: kurus(q.fiyat) });
    const noktalar = cizim.noktalar?.filter(gecerli).map(yuvarla);
    const cizgiler = cizim.cizgiler?.filter((l) => gecerli(l.a) && gecerli(l.b)).map((l) => ({ ...l, a: yuvarla(l.a), b: yuvarla(l.b) }));
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
    fiyat,
  };
}

/**
 * Parasal sayıyı kuruşa yuvarla: 1'in altındaki fiyatlarda 4 ondalık, üstünde 2 ondalık.
 * Yahoo float32 artığı (343.86260986328125) hiçbir çıktıya taşınmasın.
 */
export function kurus(x: number): number {
  if (!Number.isFinite(x)) return x;
  const kat = Math.abs(x) < 1 ? 10000 : 100;
  return Math.round(x * kat) / kat;
}

/** Hedef eşiği: uygulamanın yukariHedefler ve sicil.ts EN_AZ_HEDEF_ORANI ile aynı (fiyatın yüzde 1,5 ötesi). */
export const HEDEF_ESIK = 1.015;
const HEDEF_AD = /hedef/i;
const NUMARALI_HEDEF = /^Hedef \d+/;

/**
 * "Hedef" adlı seviyeleri eşleşmenin yönüne göre süz ve sırala:
 *  - al: hedef ≥ fiyat × 1,015 olmalı; altında kalan seviye "hedef" değildir, atılır.
 *  - sat: hedef ≤ fiyat ÷ 1,015 olmalı.
 *  - izle: adında "aşağı" geçen ya da fiyatın altındaki seviye aşağı hedef, öbürü yukarı hedef sayılır;
 *    fiyatın yüzde 1,5'inden yakın olan atılır.
 * Kalan hedefler fiyata yakınlık sırasıyla dizilir ve "Hedef N" numaraları bu sıraya göre yeniden verilir:
 * listedeki "Hedef 1", uygulamanın seçtiği ilk hedefle aynı olsun.
 */
/** Yönlü bir eşleşmede seviye hedef sayılır mı (al: fiyatın en az yüzde 1,5 üstü; sat: en az yüzde 1,5 altı). */
export function hedefGecerli(v: number, yon: 'al' | 'sat', fiyat: number): boolean {
  const k = kurus(v);
  const f = kurus(fiyat);
  return Number.isFinite(k) && k > 0 && (yon === 'al' ? k >= f * HEDEF_ESIK : k <= f / HEDEF_ESIK);
}

/**
 * Gerekçedeki hedef cümlesi: yalnız hedef sayılan seviyeler yazılır ("yüzde 38,2 için 12,40 ve yüzde 61,8 için 13,10").
 * Hiçbiri kalmazsa boş dizi döner; çağıran cümleyi hedefsiz kurar.
 */
export function hedefParcalari(parcalar: [string, number][], yon: 'al' | 'sat', fiyat: number): string[] {
  return parcalar.filter(([, v]) => hedefGecerli(v, yon, fiyat)).map(([ad, v]) => `${ad} için ${f2(v)}`);
}

export function hedefleriSuz(sev: Record<string, number>, yon: Yon, fiyat: number): Record<string, number> {
  const diger: [string, number][] = [];
  const hedefler: [string, number][] = [];
  for (const [ad, v] of Object.entries(sev)) {
    if (!HEDEF_AD.test(ad)) { diger.push([ad, v]); continue; }
    const yukari = yon === 'al' ? true : yon === 'sat' ? false : !/aşağı/i.test(ad) && v > fiyat;
    const gecerli = yukari ? v >= fiyat * HEDEF_ESIK : v <= fiyat / HEDEF_ESIK;
    if (gecerli) hedefler.push([ad, v]);
  }
  hedefler.sort((a, b) => Math.abs(a[1] - fiyat) - Math.abs(b[1] - fiyat));
  // Numaralı hedefler (Hedef 1, Hedef 2) her yön için ayrı sayılır; izle eşleşmesinde yukarı ve aşağı karışmaz.
  const sayac = { yukari: 0, asagi: 0 };
  const out: Record<string, number> = {};
  for (const [ad, v] of diger) out[ad] = v;
  for (const [ad, v] of hedefler) {
    let yeniAd = ad;
    if (NUMARALI_HEDEF.test(ad)) {
      const taraf = v > fiyat ? 'yukari' : 'asagi';
      sayac[taraf]++;
      yeniAd = ad.replace(NUMARALI_HEDEF, `Hedef ${sayac[taraf]}`);
    }
    out[yeniAd] = v;
  }
  return out;
}

export const kapanislar = (m: { k: number }[]) => m.map((x) => x.k);

/**
 * Son KAPANMIŞ muma göre zaman: "son kapanışta" / "3 işlem günü önce"; cümle başında büyük harfle.
 * "Bugün" yazılmaz: tarama yalnız kapanmış mumu görür, seans içindeki koşuda son kapanış dündür.
 */
export function gunOnce(n: number, cumleBasi = false): string {
  if (n <= 0) return cumleBasi ? 'Son kapanışta' : 'son kapanışta';
  return `${n} işlem günü önce`;
}

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

/** Çizim noktası: mum sırası i → son mumdan geriye sayım. Fiyat kuruşa yuvarlanır (kurus). */
export function nokta(m: Mum[], i: number, fiyat: number, ad: string): CizimNokta {
  return { g: Math.max(0, m.length - 1 - Math.round(i)), fiyat: kurus(fiyat), ad };
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
