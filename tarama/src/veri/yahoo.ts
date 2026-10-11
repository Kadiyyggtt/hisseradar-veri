import type { Mum } from '../tipler';

/**
 * YAHOO FINANCE grafik uç noktası. Resmi API değil; kırılırsa `stooq.ts`
 * yedeği devreye girer. BIST sembolleri ".IS" ekiyle (THYAO.IS), endeks
 * "XU100.IS". 15 dakika gecikmeli; gün içi (1h) en çok 730 gün.
 */
const TABAN = 'https://query1.finance.yahoo.com/v8/finance/chart/';

interface YahooCevap {
  chart: {
    result?: {
      timestamp?: number[];
      indicators: { quote: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }[] };
    }[];
    error?: { code: string; description: string } | null;
  };
}

export async function yahooMumlar(sembol: string, aralik: '1h' | '1d', menzil: string): Promise<Mum[]> {
  const url = `${TABAN}${encodeURIComponent(sembol)}?interval=${aralik}&range=${menzil}&includePrePost=false`;
  const cevap = await getirYenidenDene(url);
  const veri = (await cevap.json()) as YahooCevap;
  if (veri.chart.error) throw new Error(`${sembol}: ${veri.chart.error.description}`);
  const r = veri.chart.result?.[0];
  if (!r?.timestamp) return [];
  const q = r.indicators.quote[0];
  const out: Mum[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const k = q.close[i];
    if (k == null || q.open[i] == null) continue; // eksik mum
    out.push({ t: r.timestamp[i], a: q.open[i], y: q.high[i], d: q.low[i], k, h: q.volume[i] ?? 0 });
  }
  return out;
}

async function getirYenidenDene(url: string, deneme = 3): Promise<Response> {
  let sonHata: unknown;
  for (let i = 0; i < deneme; i++) {
    try {
      const c = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (HisseRadar tarama)' } });
      if (c.status === 429 || c.status >= 500) {
        await bekle(1500 * (i + 1));
        continue;
      }
      if (!c.ok) throw new Error(`HTTP ${c.status}`);
      return c;
    } catch (e) {
      sonHata = e;
      await bekle(1000 * (i + 1));
    }
  }
  throw sonHata instanceof Error ? sonHata : new Error('istek başarısız');
}

export const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
