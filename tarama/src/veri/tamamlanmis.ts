import type { Mum, Seriler } from '../tipler';
import { aylik, dortSaatlik, haftalik } from '../gostergeler/periyot';

/**
 * TAMAMLANMIŞ MUM — tarama yalnız kapanmış mumlardan sinyal üretir.
 *
 * Koşular seans içine de düşer (GitHub zamanlayıcısı saatlerce gecikir). Yahoo o anda
 * günün, haftanın ve ayın OLUŞMAKTA olan mumunu da verir. Bu mumla tarama yapılırsa
 * "Son ay mumu pozitif kapattı" ay bitmeden yazılır, gün içi eşleşme akşam kaybolur,
 * sicile ve otomatik portföye seans içi fiyat girer (29 Ekim 2026 son testi).
 *
 * Kurallar (zamanlar UTC saniye):
 *   gün   seans kapanışı + pay geçince tamam. BIST 18:00 TR = 15:00 UTC (kapanış seansı
 *         payıyla 15:15). ABD 16:00 New York; yaz saatinde 20:15 UTC, kışın 21:15 UTC.
 *   hafta haftanın cuma kapanışı geçince tamam (cuma tatilse de cumayı bekler: ihtiyatlı).
 *   ay    ayın son iş gününün (pzt-cuma) kapanışı geçince tamam.
 *   1 saat mumun başlangıcından 1 saat geçince tamam.
 *   4 saat yalnız seansı kapanmış günlerin saatlik mumlarından kurulur: 4 saatlik bölme
 *         günün mum sayısına göre yapıldığı için yarım gün yanlış bölünürdü.
 * Yarım gün (arife) ve resmî tatil bilinmez; kurallar o günlerde yalnız GECİKMELİ davranır,
 * hiçbir zaman kapanmamış mumu kapanmış saymaz.
 */
export type Piyasa = 'BIST' | 'ABD';

const PAY_DK = 15;

/** New York'un o andaki UTC farkı (saat): yaz -4, kış -5. */
export function newYorkFarki(utcMs: number): number {
  const parca = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const n = Number(parca.replace('GMT', ''));
  return Number.isFinite(n) && n !== 0 ? n : -5;
}

/** Verilen UTC takvim gününün (yıl, ay 0-11, gün) seans kapanışı + pay, UTC saniye. */
export function gunKapanisi(piyasa: Piyasa, yil: number, ay: number, gun: number): number {
  if (piyasa === 'BIST') return Date.UTC(yil, ay, gun, 15, PAY_DK) / 1000;
  const yerelKapanis = Date.UTC(yil, ay, gun, 16, PAY_DK);
  return (yerelKapanis - newYorkFarki(yerelKapanis) * 3600_000) / 1000;
}

/** Mumun takvim günü: Yahoo günlük mumunu seans açılışında damgalar (BIST 06:30, ABD 13:30 UTC); UTC tarihi borsa günüdür. */
function gunu(t: number): [number, number, number] {
  const d = new Date(t * 1000);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

export function gunTamamMi(piyasa: Piyasa, mumT: number, simdi: number): boolean {
  return simdi >= gunKapanisi(piyasa, ...gunu(mumT));
}

/** Haftalık mum (t = haftanın ilk işlem günü) tamam mı: o haftanın cuması kapandı mı. */
export function haftaTamamMi(piyasa: Piyasa, haftaT: number, simdi: number): boolean {
  const d = new Date(haftaT * 1000);
  const pztyeKadar = (d.getUTCDay() + 6) % 7;
  const cuma = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - pztyeKadar + 4));
  return simdi >= gunKapanisi(piyasa, cuma.getUTCFullYear(), cuma.getUTCMonth(), cuma.getUTCDate());
}

/** Aylık mum tamam mı: ayın son iş günü (pzt-cuma) kapandı mı. */
export function ayTamamMi(piyasa: Piyasa, ayT: number, simdi: number): boolean {
  const d = new Date(ayT * 1000);
  const son = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  while (son.getUTCDay() === 0 || son.getUTCDay() === 6) son.setUTCDate(son.getUTCDate() - 1);
  return simdi >= gunKapanisi(piyasa, son.getUTCFullYear(), son.getUTCMonth(), son.getUTCDate());
}

/** Seansı kapanmış günlerin saatlik mumları (4 saatlik kurmak için). */
export function kapanmisGunlerinSaatlikleri(piyasa: Piyasa, saatlik: Mum[], simdi: number): Mum[] {
  return saatlik.filter((m) => gunTamamMi(piyasa, m.t, simdi));
}

const sonuDus = (m: Mum[], tamam: (son: Mum) => boolean): Mum[] => (m.length && !tamam(m[m.length - 1]) ? m.slice(0, -1) : m);

export interface TamamlanmisSonuc {
  /** Taramaya giden seriler: yalnız kapanmış mumlar. */
  seriler: Seriler;
  /** Hangi periyodun son mumu oluşuyordu (kesildi). */
  olusuyor: { gun: boolean; hafta: boolean; ay: boolean; saat: boolean };
}

/**
 * Ham serilerden (getir.ts) taramaya gidecek tamamlanmış seriler. Günlük/haftalık/aylık
 * yeniden kurulur: haftalık ve aylık, oluşan günlük mum kesildikten sonra toplanır.
 */
export function tamamlanmisSeriler(ham: Seriler, simdi: number): TamamlanmisSonuc {
  const p = ham.piyasa;
  const gunluk = sonuDus(ham['1d'], (m) => gunTamamMi(p, m.t, simdi));
  const haftalikTam = sonuDus(haftalik(gunluk), (m) => haftaTamamMi(p, m.t, simdi));
  const aylikTam = sonuDus(aylik(gunluk), (m) => ayTamamMi(p, m.t, simdi));
  const saatlik = sonuDus(ham['1h'], (m) => simdi >= m.t + 3600);
  return {
    seriler: {
      sembol: ham.sembol,
      piyasa: p,
      '1h': saatlik,
      '4h': dortSaatlik(kapanmisGunlerinSaatlikleri(p, ham['1h'], simdi)),
      '1d': gunluk,
      '1w': haftalikTam,
      '1mo': aylikTam,
    },
    olusuyor: {
      gun: gunluk.length !== ham['1d'].length,
      hafta: haftalik(ham['1d']).length !== haftalikTam.length,
      ay: aylik(ham['1d']).length !== aylikTam.length,
      saat: saatlik.length !== ham['1h'].length,
    },
  };
}
