import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRIFING_KONUSU, HAFTALIK_KONUSU, haftalikOzet, sabahBrifingi, veriGuncelMi } from './bildirim-metin';
import { erisimAnahtari, gonder, gonderimSerbestMi, hesabiOku, ozetYaz } from './fcm';
import type { Eslesme, Sicil, TaramaSonucu } from './tipler';

/**
 * BRİFİNG — `npm run brifing -- sabah` ya da `-- hafta` (pazar akşamı, brifing.yml).
 * Sabah brifingi ayrı cron'la değil, tarama iş akışında günün ilk sabah koşusunun sonunda
 * gider (tara → yayınla → bildir → brifing): GitHub cron'u saatlerce gecikse de brifing
 * taramayla aynı anda gelir. ILK_KOSU=1 iken yalnız yeni.json `sabahIlk: true` ise gönderir;
 * elle tetiklemede (brifing.yml) bu şart yoktur. Sessiz saatte (22:00-08:00 TR) gönderilmez.
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
  const simdi = Date.now();
  if (process.env.ILK_KOSU === '1') {
    const y = oku<{ uretildi: number; sabahIlk?: boolean }>('yeni.json');
    if (!y?.sabahIlk || y.uretildi !== sonuc.uretildi) {
      ozetYaz('Sabah brifingi: bu koşu günün ilk sabah koşusu değil, gönderilmedi.');
      return;
    }
  }
  if (!veriGuncelMi(sonuc.uretildi, Math.floor(simdi / 1000))) {
    // Tarama düşmüş: günler önceki aday listesi bugünün brifingi gibi gitmesin. İş akışında uyarı olarak görünür.
    ozetYaz(`Brifing: veri güncel değil (son tarama ${new Date(sonuc.uretildi * 1000).toISOString()}), gönderilmedi.`);
    return;
  }
  const yeni = oku<{ eslesmeler: Eslesme[] }>('yeni.json')?.eslesmeler ?? [];
  const metin = tur === 'sabah' ? sabahBrifingi(sonuc, yeni, simdi) : haftalikOzet(sonuc, oku<Sicil>('sicil.json'), simdi);
  console.log(`${metin.baslik}\n${metin.govde}`);
  if (process.env.KURU) return;
  const hesap = hesabiOku();
  if (!hesap) { ozetYaz(`### ${tur === 'sabah' ? 'Sabah brifingi' : 'Haftalık özet'} GÖNDERİLMEDİ\nFCM_SERVIS_HESABI gizli değeri tanımlı değil.`); return; }
  if (!gonderimSerbestMi(simdi)) { ozetYaz('Brifing: sessiz saat (22:00-08:00 TR), gönderilmedi.'); return; }
  const anahtar = await erisimAnahtari(hesap);
  const tamam = await gonder(hesap, anahtar, tur === 'sabah' ? BRIFING_KONUSU : HAFTALIK_KONUSU, metin, { tur: tur === 'sabah' ? 'brifing' : 'haftalik' });
  if (!tamam) {
    ozetYaz('Brifing gönderilemedi (1 başarısız).');
    process.exitCode = 1;
  } else ozetYaz(`${tur === 'sabah' ? 'Sabah brifingi' : 'Haftalık özet'} gönderildi.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
