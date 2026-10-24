import type { Eslesme, HedefUlasan, Sicil, SicilKayit } from './tipler';

/**
 * SİCİL — her formasyonun "ileriye dönük" karnesi. Geçmişe bakıp hesaplamıyoruz:
 * bir eşleşme ilk görüldüğü gün kayda girer (giriş fiyatı + ilk yukarı hedef),
 * sonraki taramalarda fiyat hedefe değdi mi diye bakılır. SURE_GUN içinde
 * değmezse "ulaşmadı" sayılır. Sonuç yalnız kapanan kayıtlardan hesaplanır.
 */
export const SURE_GUN = 30;
export const EN_AZ_SONUC = 5;
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

export function sicilIlerlet(onceki: Sicil | null, eslesmeler: Eslesme[], fiyatlar: Map<string, number>, simdi: number): Sicil {
  const kapali = [...(onceki?.kapali ?? [])];
  const acik: SicilKayit[] = [];
  const goruldu = new Set<string>();

  for (const k of onceki?.acik ?? []) {
    const f = fiyatlar.get(`${k.piyasa}:${k.sembol}`);
    if (f !== undefined && f >= k.hedef) kapali.push({ ...k, sonuc: 'ulasti', bitis: simdi });
    else if (simdi - k.t >= SURE_GUN * GUN) kapali.push({ ...k, sonuc: 'ulasmadi', bitis: simdi });
    else acik.push(k);
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

  // Kapanmış kayıtların yalnız son 400'ü tutulur (dosya şişmesin).
  const son = kapali.slice(-400);
  const ozet: Sicil['ozet'] = {};
  for (const k of son) {
    const o = (ozet[k.taramaId] ??= { n: 0, ulasan: 0 });
    o.n++;
    if (k.sonuc === 'ulasti') o.ulasan++;
  }
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
