import type { Eslesme, HedefUlasan, Sicil, SicilKayit } from './tipler';

/**
 * SİCİL — her formasyonun "ileriye dönük" karnesi. Geçmişe bakıp hesaplamıyoruz:
 * bir eşleşme ilk görüldüğü gün kayda girer (giriş fiyatı + ilk yukarı hedef),
 * sonraki taramalarda fiyat hedefe değdi mi diye bakılır. SURE_GUN içinde
 * değmezse "ulaşmadı" sayılır. Sonuç yalnız kapanan kayıtlardan hesaplanır.
 *
 * Özet (ozet) formasyon başına KÜMÜLATİF sayaçtır: her kapanış bir kez eklenir.
 * Dosyadaki açık/kapalı diziler ise yalnız son KAYIT_GUN günü taşır (dosya şişmesin;
 * eskiden "son 400 kapanış" penceresi hem özeti hem dosyayı belirliyordu).
 */
export const SURE_GUN = 30;
export const EN_AZ_SONUC = 5;
/** sicil.json'daki kapalı kayıtların tutulduğu gün; "yeniden açılmasın" süzgeci de bu pencereye bakar. */
export const KAYIT_GUN = 30;
const GUN = 86400;

/** Karneye girecek hedef fiyattan en az bu kadar uzak olmalı; daha yakını "ulaştı" sayımını şişirir (abcd-esnek yüzde 0,3'lük hedefle 10/10 çıkıyordu). */
export const EN_AZ_HEDEF_ORANI = 1.015;

/** Eşleşmenin fiyatın üstündeki en yakın anlamlı "Hedef…" seviyesi; yoksa null. */
export function ilkHedef(e: Eslesme): number | null {
  if (!e.seviyeler) return null;
  const ust = Object.entries(e.seviyeler)
    .filter(([ad, v]) => /hedef/i.test(ad) && Number.isFinite(v) && v >= e.fiyat * EN_AZ_HEDEF_ORANI)
    .map(([, v]) => v)
    .sort((a, b) => a - b);
  return ust.length ? ust[0] : null;
}

/** EN_AZ_HEDEF_ORANI eşiği konmadan önce girmiş kayıt (hedef girişin %1,5'inden yakın): karneyi %100 gösteriyordu. */
export const esikAltiKayit = (k: SicilKayit) => !(Number.isFinite(k.hedef) && Number.isFinite(k.giris) && k.giris > 0 && k.hedef >= k.giris * EN_AZ_HEDEF_ORANI);

export function ozetHesapla(kapali: SicilKayit[]): Sicil['ozet'] {
  const ozet: Sicil['ozet'] = {};
  for (const k of kapali) ozetEkle(ozet, k);
  return ozet;
}

function ozetEkle(ozet: Sicil['ozet'], k: SicilKayit) {
  const o = (ozet[k.taramaId] ??= { n: 0, ulasan: 0 });
  o.n++;
  if (k.sonuc === 'ulasti') o.ulasan++;
}

export function sicilIlerlet(onceki: Sicil | null, eslesmeler: Eslesme[], fiyatlar: Map<string, number>, simdi: number): Sicil {
  let oncekiAcik = onceki?.acik ?? [];
  let oncekiKapali = onceki?.kapali ?? [];
  // Özet kopyalanır: önceki nesne değişmesin (testler aynı sicilden iki dal yürütüyor).
  let ozet: Sicil['ozet'] = Object.fromEntries(Object.entries(onceki?.ozet ?? {}).map(([id, o]) => [id, { ...o }]));
  // Bir kerelik temizlik: eşik öncesi kayıtlar listelerden düşer, özet kalan kapanışlardan yeniden kurulur.
  // Temizlikten sonra böyle kayıt oluşmaz (ilkHedef süzer); koşul bir daha tetiklenmez.
  if (oncekiAcik.some(esikAltiKayit) || oncekiKapali.some(esikAltiKayit)) {
    oncekiAcik = oncekiAcik.filter((k) => !esikAltiKayit(k));
    oncekiKapali = oncekiKapali.filter((k) => !esikAltiKayit(k));
    ozet = ozetHesapla(oncekiKapali);
  }

  const kapali = [...oncekiKapali];
  const acik: SicilKayit[] = [];
  const goruldu = new Set<string>();

  for (const k of oncekiAcik) {
    const f = fiyatlar.get(`${k.piyasa}:${k.sembol}`);
    let kapanan: SicilKayit | null = null;
    if (f !== undefined && f >= k.hedef) kapanan = { ...k, sonuc: 'ulasti', bitis: simdi };
    else if (simdi - k.t >= SURE_GUN * GUN) kapanan = { ...k, sonuc: 'ulasmadi', bitis: simdi };
    if (kapanan) {
      kapali.push(kapanan);
      ozetEkle(ozet, kapanan);
    } else acik.push(k);
  }
  for (const k of acik) goruldu.add(`${k.piyasa}:${k.sembol}:${k.taramaId}`);
  for (const k of kapali) if (simdi - (k.bitis ?? 0) < SURE_GUN * GUN) goruldu.add(`${k.piyasa}:${k.sembol}:${k.taramaId}`);

  for (const e of eslesmeler) {
    if (e.yon !== 'al') continue;
    const h = ilkHedef(e);
    if (h === null) continue;
    const anahtar = `${e.piyasa}:${e.sembol}:${e.taramaId}`;
    if (goruldu.has(anahtar)) continue;
    goruldu.add(anahtar);
    acik.push({ sembol: e.sembol, piyasa: e.piyasa, taramaId: e.taramaId, giris: e.fiyat, hedef: h, t: simdi });
  }

  // Dosyada yalnız son KAYIT_GUN günün kapanışları; özet bunlardan bağımsız, kümülatif.
  const son = kapali.filter((k) => simdi - (k.bitis ?? 0) < KAYIT_GUN * GUN);
  return { surum: 1, uretildi: simdi, sureGun: SURE_GUN, enAz: EN_AZ_SONUC, acik, kapali: son, ozet };
}

/**
 * Bu koşuda "ulaştı" diye kapanan kayıtlar (bitiş zamanı = şimdi) ve o anki fiyat.
 * Hedef bildirimi yalnız bunlar için gider; önceki koşularda kapananlar yeniden bildirilmez.
 */
export function hedefeUlasanlar(sicil: Sicil, simdi: number, fiyatlar: Map<string, number>): HedefUlasan[] {
  return sicil.kapali
    .filter((k) => k.sonuc === 'ulasti' && k.bitis === simdi)
    .map((k) => ({ ...k, fiyat: fiyatlar.get(`${k.piyasa}:${k.sembol}`) ?? k.hedef }));
}
