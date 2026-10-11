import type { Seriler } from '../tipler';
import { aylik, dortSaatlik, haftalik } from '../gostergeler/periyot';
import { stooqGunluk } from './stooq';
import { bekle, yahooMumlar } from './yahoo';
import { yahooSembol } from './evren';

/** Bir sembolün bütün periyotlarını kur. Hata fırlatırsa çağıran sembolü "hatalı" sayar. */
export async function serileriGetir(sembol: string, piyasa: 'BIST' | 'ABD'): Promise<Seriler> {
  const ys = yahooSembol(sembol, piyasa);
  let gunluk = await yahooMumlar(ys, '1d', '3y').catch(() => [] as Awaited<ReturnType<typeof yahooMumlar>>);
  if (gunluk.length < 250) {
    const yedek = await stooqGunluk(sembol, piyasa).catch(() => []);
    if (yedek.length > gunluk.length) gunluk = yedek;
  }
  if (gunluk.length < 250) throw new Error(`${sembol}: yeterli günlük veri yok (${gunluk.length})`);
  await bekle(150); // kaynağa nazik ol
  const saatlik = await yahooMumlar(ys, '1h', '730d').catch(() => []);
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
