import type { Ortam } from './tipler';
import { ema } from './gostergeler/ortalama';
import { dortSaatlik } from './gostergeler/periyot';
import { kapanmisGunlerinSaatlikleri } from './veri/tamamlanmis';
import { ENDEKSLER } from './veri/evren';
import { yahooMumlar } from './veri/yahoo';

/** Endeks Nabzı 8/20: endeksin 4 saatlik grafiğinde EMA8 > EMA20 mi. */
export async function ortamiOlc(): Promise<Ortam> {
  const sonuc: Ortam = { endeksNabzi: { XU100: null, SPX: null } };
  for (const [ad, sembol] of Object.entries(ENDEKSLER) as ['XU100' | 'SPX', string][]) {
    try {
      const saatlik = await yahooMumlar(sembol, '1h', '120d');
      // Yalnız seansı kapanmış günler: oluşan 4 saatlik mum nabzı gün içinde oynatmasın.
      const d4 = dortSaatlik(kapanmisGunlerinSaatlikleri(ad === 'XU100' ? 'BIST' : 'ABD', saatlik, Math.floor(Date.now() / 1000)));
      const k = d4.map((m) => m.k);
      const e8 = ema(k, 8);
      const e20 = ema(k, 20);
      const i = k.length - 1;
      if (i < 20 || !Number.isFinite(e20[i])) continue;
      sonuc.endeksNabzi[ad] = { pozitif: e8[i] > e20[i], ema8: e8[i], ema20: e20[i], t: d4[i].t };
    } catch (e) {
      console.error(`Endeks ${ad} alınamadı:`, (e as Error).message);
    }
  }
  return sonuc;
}
