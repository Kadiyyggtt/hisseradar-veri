import type { Mum, Seriler } from '../tipler';
import { aylik, dortSaatlik, haftalik } from '../gostergeler/periyot';
import { stooqGunluk } from './stooq';
import { bekle, hataTuru, VeriHatasi, yahooMumlar } from './yahoo';
import { yahooSembol } from './evren';

/** Tam tarama için gereken günlük mum (200 günlük ortalama + pay). */
export const TAM_MUM = 250;
/** Bunun altı hiç taranmaz; 60..249 arası grafik.json'a yazılır, yalnız kısa seriyle çalışan tarayıcılar koşar. */
export const EN_AZ_MUM = 60;

/**
 * Bir sembolün bütün periyotlarını kur. Hata fırlatırsa çağıran sembolü "hatalı" sayar;
 * hata VeriHatasi'dır ve türü (yok/hiz/ag/kisa) özete yazılır. Yahoo hatası yutulmaz:
 * yedek de yetmezse Yahoo'nun asıl hatası iletilir.
 */
export async function serileriGetir(sembol: string, piyasa: 'BIST' | 'ABD'): Promise<Seriler> {
  const ys = yahooSembol(sembol, piyasa);
  let gunluk: Mum[] = [];
  let yahooHatasi: unknown = null;
  try {
    gunluk = await yahooMumlar(ys, '1d', '3y');
  } catch (e) {
    yahooHatasi = e;
  }
  // 404'te Stooq da bulamaz (aynı sembol yok); diğer durumlarda yedeği dene.
  if (gunluk.length < TAM_MUM && hataTuru(yahooHatasi) !== 'yok') {
    const yedek = await stooqGunluk(sembol, piyasa).catch(() => [] as Mum[]);
    if (yedek.length > gunluk.length) gunluk = yedek;
  }
  if (gunluk.length < EN_AZ_MUM) {
    if (yahooHatasi && !gunluk.length) {
      const tur = hataTuru(yahooHatasi);
      throw new VeriHatasi(tur, `${sembol}: ${(yahooHatasi as Error).message}`);
    }
    throw new VeriHatasi(gunluk.length ? 'kisa' : 'yok', `${sembol}: yeterli günlük veri yok (${gunluk.length})`);
  }
  await bekle(150); // kaynağa nazik ol
  const saatlik = await saatlikGetir(ys).catch((e: unknown) => {
    // Saatlik yoksa günlük tarayıcılar yine koşar; yalnız 1h/4h tarayıcıları susar.
    console.warn(`  ${sembol}: saatlik veri alınamadı (${hataTuru(e)})`);
    return [] as Mum[];
  });
  return {
    sembol,
    piyasa,
    '1h': saatlik,
    '4h': dortSaatlik(saatlik),
    '1d': gunluk,
    '1w': haftalik(gunluk),
    '1mo': aylik(gunluk),
  };
}

/**
 * Saatlik mumlar. '730d' en uzun geçmişi verir (THYAO: 2023'ten, ~6.500 mum), ama iki yıldan genç
 * hissede (halka arz 2024 sonrası: EFOR, KTLEV, ODINE… BIST'in yüzde 13'ü) Yahoo HTTP 422 döner.
 * O zaman '2y' istenir; 29 Ekim 2026'da bu 46 hissenin hepsinde 200 döndü. Eskiden 422 "ağ"
 * sayılıp susuluyordu ve bu hisseler saatlik ve 4 saatlik taramaya hiç girmiyordu.
 */
export async function saatlikGetir(ys: string, al: (s: string, aralik: '1h', uzunluk: string) => Promise<Mum[]> = yahooMumlar): Promise<Mum[]> {
  try {
    return await al(ys, '1h', '730d');
  } catch (e) {
    if (hataTuru(e) !== 'aralik') throw e;
    return al(ys, '1h', '2y');
  }
}
