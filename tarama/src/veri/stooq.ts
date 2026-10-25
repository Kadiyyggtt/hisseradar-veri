import type { Mum } from '../tipler';
import { ZAMAN_ASIMI_MS } from './yahoo';

/**
 * STOOQ yedeği — yalnız GÜNLÜK veri. Sembol biçimi: ABD "aapl.us",
 * BIST "thyao.tr". Stooq'un BIST kapsamı sınırlı ve 2025'ten beri çoğu istekte
 * boş CSV dönüyor; boş dönünce günlüğe uyarı düşülür ki yedeğin çalışmadığı görülsün.
 */
export async function stooqGunluk(sembol: string, piyasa: 'BIST' | 'ABD'): Promise<Mum[]> {
  const kod = piyasa === 'ABD' ? `${sembol.toLowerCase()}.us` : `${sembol.toLowerCase()}.tr`;
  const url = `https://stooq.com/q/d/l/?s=${kod}&i=d`;
  const c = await fetch(url, { signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  if (!c.ok) {
    console.warn(`  ${sembol}: Stooq yedeği HTTP ${c.status}`);
    return [];
  }
  const metin = await c.text();
  const satirlar = metin.trim().split('\n');
  if (satirlar.length < 2 || !satirlar[0].startsWith('Date')) {
    console.warn(`  ${sembol}: Stooq yedeği boş döndü`);
    return [];
  }
  const out: Mum[] = [];
  for (const s of satirlar.slice(1)) {
    const [tarih, a, y, d, k, h] = s.split(',');
    const t = Date.parse(`${tarih}T00:00:00Z`) / 1000;
    if (!Number.isFinite(t)) continue;
    const mum = { t, a: +a, y: +y, d: +d, k: +k, h: +(h ?? 0) || 0 };
    if (![mum.a, mum.y, mum.d, mum.k].every((v) => Number.isFinite(v) && v > 0)) continue;
    out.push(mum);
  }
  return out;
}
