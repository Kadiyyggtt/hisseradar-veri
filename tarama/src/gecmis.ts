import type { GecmisDosyasi, GecmisGun, Portfoy } from './tipler';

/**
 * GEÇMİŞ — her koşuda günün satırı yazılır; aynı gün ikinci koşu satırı günceller
 * (gün içi 4 koşunun sonuncusu kalır). 400 günden eskisi düşer.
 */
export const EN_COK_GUN = 400;

/** İstanbul gününün başlangıcı (unix saniye). Yaz saati yok: sabit UTC+3. */
export function gunBasi(unix: number): number {
  const yerel = unix + 3 * 3600;
  return yerel - (yerel % 86400) - 3 * 3600;
}

export function gecmisIlerlet(onceki: GecmisDosyasi | null, simdi: number, endeks: { xu100: number | null; spx: number | null }, portfoy: Portfoy | null): GecmisDosyasi {
  const t = gunBasi(simdi);
  const satir: GecmisGun = {
    t,
    xu100: endeks.xu100,
    spx: endeks.spx,
    hayali: { hafta: portfoy?.hafta?.deger ?? null, ay: portfoy?.ay?.deger ?? null, yil: portfoy?.yil?.deger ?? null },
  };
  const gunler = (onceki?.gunler ?? []).filter((g) => g.t !== t && g.t < t);
  gunler.push(satir);
  return { surum: 1, uretildi: simdi, gunler: gunler.slice(-EN_COK_GUN) };
}
