import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Eslesme, TaramaSonucu } from './tipler';
import { ortamiOlc } from './ortam';
import { TARAYICILAR } from './stratejiler';
import { ABD, BIST } from './veri/evren';
import { serileriGetir } from './veri/getir';

/**
 * TARAMA ÇALIŞTIRICISI — GitHub Actions'ta günde birkaç kez koşar, sonucu
 * docs/tarama/sonuc.json'a yazar (GitHub Pages bu klasörü yayınlar).
 * Uygulama yalnız bu dosyayı okur; telefonda hiçbir hesap yapılmaz.
 *
 * Ortam değişkenleri:
 *   SINIR=20     → her piyasadan ilk N sembol (yerel deneme için)
 *   PIYASA=BIST  → tek piyasa
 *   ESZAMANLI=4  → aynı anda kaç sembol çekilsin (kaynağa nazik: 4)
 */
// npm betikleri proje kökünden çalışır.
const KOK = process.cwd();
const CIKTI = join(KOK, 'docs', 'tarama');

async function main() {
  const sinir = Number(process.env.SINIR ?? 0) || Infinity;
  const tekPiyasa = process.env.PIYASA as 'BIST' | 'ABD' | undefined;
  const eszamanli = Number(process.env.ESZAMANLI ?? 4);

  const ortam = await ortamiOlc();
  console.log('Endeks Nabzı:', JSON.stringify(ortam.endeksNabzi));

  const isler: { sembol: string; piyasa: 'BIST' | 'ABD' }[] = [];
  if (tekPiyasa !== 'ABD') for (const s of BIST.slice(0, sinir)) isler.push({ sembol: s, piyasa: 'BIST' });
  if (tekPiyasa !== 'BIST') for (const s of ABD.slice(0, sinir)) isler.push({ sembol: s, piyasa: 'ABD' });

  const eslesmeler: Eslesme[] = [];
  const hatali: string[] = [];
  const sayac: Record<string, number> = {};
  let bitti = 0;

  // Basit eşzamanlılık: N işçi, kuyruktan çeker.
  let sira = 0;
  const isci = async () => {
    while (sira < isler.length) {
      const is = isler[sira++];
      try {
        const seriler = await serileriGetir(is.sembol, is.piyasa);
        for (const t of TARAYICILAR) {
          if (t.sart && !t.sart(ortam, is.piyasa)) continue;
          let e: Eslesme | null = null;
          try {
            e = t.tara(seriler, ortam);
          } catch (hata) {
            console.error(`  ${is.sembol} ${t.id}: tarayıcı hatası`, (hata as Error).message);
          }
          if (e) {
            eslesmeler.push(e);
            sayac[t.id] = (sayac[t.id] ?? 0) + 1;
          }
        }
      } catch (hata) {
        hatali.push(`${is.piyasa}:${is.sembol}`);
        console.error(`  ${is.sembol}: ${(hata as Error).message}`);
      }
      bitti++;
      if (bitti % 20 === 0) console.log(`${bitti}/${isler.length}`);
    }
  };
  await Promise.all(Array.from({ length: eszamanli }, isci));

  const sonuc: TaramaSonucu = {
    surum: 1,
    uretildi: Math.floor(Date.now() / 1000),
    ortam,
    eslesmeler: eslesmeler.sort((a, b) => b.guven - a.guven || a.sembol.localeCompare(b.sembol)),
    sayac,
    taranan: { BIST: isler.filter((x) => x.piyasa === 'BIST').length, ABD: isler.filter((x) => x.piyasa === 'ABD').length, hatali },
  };

  mkdirSync(CIKTI, { recursive: true });
  // Bir önceki sonuçla fark: bildirim için "yeni" eşleşmeler.
  const oncekiYol = join(CIKTI, 'sonuc.json');
  let yeni: Eslesme[] = sonuc.eslesmeler;
  if (existsSync(oncekiYol)) {
    try {
      const onceki = JSON.parse(readFileSync(oncekiYol, 'utf8')) as TaramaSonucu;
      const anahtar = (e: Eslesme) => `${e.piyasa}:${e.sembol}:${e.taramaId}:${e.yon}`;
      const eski = new Set(onceki.eslesmeler.map(anahtar));
      yeni = sonuc.eslesmeler.filter((e) => !eski.has(anahtar(e)));
    } catch {
      /* bozuk eski dosya: hepsi yeni sayılır */
    }
  }
  writeFileSync(oncekiYol, JSON.stringify(sonuc));
  writeFileSync(join(CIKTI, 'yeni.json'), JSON.stringify({ uretildi: sonuc.uretildi, eslesmeler: yeni }));
  writeFileSync(join(CIKTI, 'ozet.json'), JSON.stringify({ uretildi: sonuc.uretildi, ortam, sayac, taranan: sonuc.taranan }));
  console.log(`Bitti: ${eslesmeler.length} eşleşme, ${yeni.length} yeni, ${hatali.length} hatalı sembol.`);
  console.table(sayac);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
