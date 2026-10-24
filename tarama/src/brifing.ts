import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRIFING_KONUSU, HAFTALIK_KONUSU, haftalikOzet, sabahBrifingi } from './bildirim-metin';
import { erisimAnahtari, gonder, hesabiOku } from './fcm';
import type { Eslesme, Sicil, TaramaSonucu } from './tipler';

/**
 * BRİFİNG — `npm run brifing -- sabah` (hafta içi 09:45 TR) ya da `-- hafta` (pazar 18:00 TR).
 * Son yayınlanmış sonuçtan tek bildirim üretir; kullanıcı Ayarlar'dan konuya abone olur.
 * KURU=1 ile yalnız metni yazar, göndermez.
 */
const KOK = process.cwd();
function oku<T>(ad: string): T | null {
  const y = join(KOK, 'docs', 'tarama', ad);
  return existsSync(y) ? (JSON.parse(readFileSync(y, 'utf8')) as T) : null;
}

async function main() {
  const tur = process.argv[2];
  if (tur !== 'sabah' && tur !== 'hafta') throw new Error('kullanım: brifing.ts sabah | hafta');
  const sonuc = oku<TaramaSonucu>('sonuc.json');
  if (!sonuc) throw new Error('sonuc.json yok');
  const yeni = oku<{ eslesmeler: Eslesme[] }>('yeni.json')?.eslesmeler ?? [];
  const metin = tur === 'sabah' ? sabahBrifingi(sonuc, yeni) : haftalikOzet(sonuc, oku<Sicil>('sicil.json'));
  console.log(`${metin.baslik}\n${metin.govde}`);
  if (process.env.KURU) return;
  const hesap = hesabiOku();
  if (!hesap) { console.log('FCM_SERVIS_HESABI yok, gönderilmedi.'); return; }
  const anahtar = await erisimAnahtari(hesap);
  await gonder(hesap, anahtar, tur === 'sabah' ? BRIFING_KONUSU : HAFTALIK_KONUSU, metin, { tur: tur === 'sabah' ? 'brifing' : 'haftalik' });
}

main().catch((e) => { console.error(e); process.exit(1); });
