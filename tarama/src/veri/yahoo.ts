import type { Mum } from '../tipler';

/**
 * YAHOO FINANCE grafik uç noktası. Resmi API değil; günlük veri yetmezse `stooq.ts`
 * yedeği denenir. BIST sembolleri ".IS" ekiyle (THYAO.IS), endeks "XU100.IS".
 * Gün içi (1h) en çok 730 gün.
 */
const TABAN = 'https://query1.finance.yahoo.com/v8/finance/chart/';
/** Asılı kalan istek bütün koşuyu (40 dk sınırı) yemesin. */
export const ZAMAN_ASIMI_MS = 15000;

/**
 * Hata türü: tarama özetinde "BIST:CITAS:kisa" biçiminde yazılır, neden düştüğü günlükten okunur.
 *   yok  → sembol Yahoo'da yok (404) ya da boş cevap: yeniden denenmez
 *   hiz  → 429 hız sınırı (denemeler bitti)
 *   ag   → ağ hatası, zaman aşımı, 5xx, bozuk JSON
 *   kisa → veri var ama tarama için yetmeyecek kadar kısa
 */
/** eski: kaynak bu koşuda önceki koşudan daha ESKİ bir son mum döndürdü (gece yeniden işleme); hisse bu koşuda atlanır. */
export type VeriHataTuru = 'yok' | 'hiz' | 'ag' | 'kisa' | 'eski';

export class VeriHatasi extends Error {
  constructor(readonly tur: VeriHataTuru, mesaj: string) {
    super(mesaj);
    this.name = 'VeriHatasi';
  }
}

/** Herhangi bir hatanın türü: VeriHatasi değilse ağ sayılır. */
export const hataTuru = (e: unknown): VeriHataTuru => (e instanceof VeriHatasi ? e.tur : 'ag');

export interface YahooCevap {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[] | null;
    error?: { code: string; description: string } | null;
  };
}

const gecerli = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export async function yahooMumlar(sembol: string, aralik: '1h' | '1d', menzil: string): Promise<Mum[]> {
  const url = `${TABAN}${encodeURIComponent(sembol)}?interval=${aralik}&range=${menzil}&includePrePost=false`;
  const cevap = await getirYenidenDene(url);
  let veri: YahooCevap;
  try {
    veri = (await cevap.json()) as YahooCevap;
  } catch {
    throw new VeriHatasi('ag', `${sembol}: bozuk JSON`);
  }
  if (veri.chart?.error) throw new VeriHatasi(veri.chart.error.code === 'Not Found' ? 'yok' : 'ag', `${sembol}: ${veri.chart.error.description}`);
  return yahooCoz(veri);
}

/** Saf: Yahoo cevabından mumlar. Eksik alanlı cevapta boş dizi; sina.ts null yüksek/düşük ile sınar. */
export function yahooCoz(veri: YahooCevap): Mum[] {
  const r = veri.chart?.result?.[0];
  if (!r?.timestamp) return [];
  const q = r.indicators?.quote?.[0];
  if (!q) return [];
  const out: Mum[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const a = q.open?.[i];
    const y = q.high?.[i];
    const d = q.low?.[i];
    const k = q.close?.[i];
    // Eksik ya da sıfır fiyatlı mum atlanır: yüksek/düşük null gelince formasyon ölçüleri NaN oluyordu.
    if (!gecerli(a) || !gecerli(y) || !gecerli(d) || !gecerli(k)) continue;
    const h = q.volume?.[i];
    out.push({ t: r.timestamp[i], a, y: Math.max(y, a, k), d: Math.min(d, a, k), k, h: typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : 0 });
  }
  return out;
}

async function getirYenidenDene(url: string, deneme = 3): Promise<Response> {
  let sonHata: VeriHatasi = new VeriHatasi('ag', 'istek başarısız');
  for (let i = 0; i < deneme; i++) {
    let c: Response;
    try {
      c = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (HisseRadar tarama)' }, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
    } catch (e) {
      sonHata = new VeriHatasi('ag', (e as Error).name === 'TimeoutError' ? 'zaman aşımı' : (e as Error).message);
      await bekle(1000 * (i + 1));
      continue;
    }
    if (c.ok) return c;
    // 404: sembol yok (halka arzı geri çekilmiş, sertifika). Yeniden denemek yalnız kaynağı yorar.
    if (c.status === 404) throw new VeriHatasi('yok', 'HTTP 404');
    if (c.status === 429) sonHata = new VeriHatasi('hiz', 'HTTP 429');
    else if (c.status >= 500) sonHata = new VeriHatasi('ag', `HTTP ${c.status}`);
    else throw new VeriHatasi('ag', `HTTP ${c.status}`);
    await bekle(1500 * (i + 1));
  }
  throw sonHata;
}

export const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
