import type { Mum } from '../tipler';

/**
 * STOOQ yedeği — yalnız GÜNLÜK veri. Sembol biçimi: ABD "aapl.us",
 * BIST "thyao.tr" (Stooq'un BIST kapsamı sınırlı; eksikse boş döner).
 */
export async function stooqGunluk(sembol: string, piyasa: 'BIST' | 'ABD'): Promise<Mum[]> {
  const kod = piyasa === 'ABD' ? `${sembol.toLowerCase()}.us` : `${sembol.toLowerCase()}.tr`;
  const url = `https://stooq.com/q/d/l/?s=${kod}&i=d`;
  const c = await fetch(url);
  if (!c.ok) return [];
  const metin = await c.text();
  const satirlar = metin.trim().split('\n');
  if (satirlar.length < 2 || !satirlar[0].startsWith('Date')) return [];
  const out: Mum[] = [];
  for (const s of satirlar.slice(1)) {
    const [tarih, a, y, d, k, h] = s.split(',');
    const t = Date.parse(`${tarih}T00:00:00Z`) / 1000;
    if (!Number.isFinite(t)) continue;
    out.push({ t, a: +a, y: +y, d: +d, k: +k, h: +(h ?? 0) || 0 });
  }
  return out;
}
