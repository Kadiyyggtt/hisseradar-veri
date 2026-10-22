import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Eslesme, GrafikVerisi, Portfoy, TaramaSonucu } from './tipler';
import { portfoyuIlerlet } from './portfoy';
import { sicilIlerlet } from './sicil';
import type { Sicil } from './tipler';
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
  /** Son kapanışlar: portföy değerlemesi için, eşleşme olmasa da. */
  const fiyatlar = new Map<string, number>();
  const grafik: GrafikVerisi = { surum: 1, uretildi: Math.floor(Date.now() / 1000), seriler: {} };
  let bitti = 0;

  // Basit eşzamanlılık: N işçi, kuyruktan çeker.
  let sira = 0;
  const isci = async () => {
    while (sira < isler.length) {
      const is = isler[sira++];
      try {
        const seriler = await serileriGetir(is.sembol, is.piyasa);
        fiyatlar.set(`${is.piyasa}:${is.sembol}`, seriler['1d'][seriler['1d'].length - 1].k);
        {
          const g = seriler['1d'].slice(-60);
          grafik.seriler[`${is.piyasa}:${is.sembol}`] = {
            t0: g[0].t,
            t1: g[g.length - 1].t,
            k: g.map((m) => Math.round(m.k * 100) / 100),
            h: g.map((m) => Math.round(m.h)),
          };
        }
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
  // Bir önceki sonuçla fark: bildirim için "yeni" eşleşmeler. Portföy durumu da oradan okunur.
  const oncekiYol = join(CIKTI, 'sonuc.json');
  let yeni: Eslesme[] = sonuc.eslesmeler;
  let oncekiPortfoy: Portfoy | null = null;
  if (existsSync(oncekiYol)) {
    try {
      const onceki = JSON.parse(readFileSync(oncekiYol, 'utf8')) as TaramaSonucu;
      const anahtar = (e: Eslesme) => `${e.piyasa}:${e.sembol}:${e.taramaId}:${e.yon}`;
      const eski = new Set(onceki.eslesmeler.map(anahtar));
      yeni = sonuc.eslesmeler.filter((e) => !eski.has(anahtar(e)));
      oncekiPortfoy = onceki.portfoy ?? null;
    } catch {
      /* bozuk eski dosya: hepsi yeni sayılır */
    }
  }
  // Deneme taramasında (SINIR) portföy YAZILMAZ: yarım evrenle seçim yapılıp yayına gitmesin.
  if (sinir === Infinity && !tekPiyasa) {
    sonuc.portfoy = portfoyuIlerlet(oncekiPortfoy, sonuc.eslesmeler, fiyatlar, sonuc.uretildi);
    for (const tur of ['hafta', 'ay', 'yil'] as const) {
      const d = sonuc.portfoy[tur];
      if (d) console.log(`Portföy ${tur} ${d.anahtar}: ${d.deger} | ${d.pozisyonlar.map((p) => `${p.sembol} ${(p.getiri * 100).toFixed(1)}%`).join(', ')}`);
    }
  } else if (oncekiPortfoy) {
    sonuc.portfoy = oncekiPortfoy;
  }
  // Karne (sicil.json): hata verirse taramanın geri kalanını bozmaz.
  if (sinir === Infinity && !tekPiyasa) {
    try {
      const sicilYol = join(CIKTI, 'sicil.json');
      const eski = existsSync(sicilYol) ? (JSON.parse(readFileSync(sicilYol, 'utf8')) as Sicil) : null;
      const yeniSicil = sicilIlerlet(eski, sonuc.eslesmeler, fiyatlar, sonuc.uretildi);
      writeFileSync(sicilYol, JSON.stringify(yeniSicil));
      console.log(`Sicil: ${yeniSicil.acik.length} açık, ${yeniSicil.kapali.length} kapanmış kayıt.`);
    } catch (hata) {
      console.error('Sicil yazılamadı (tarama devam ediyor):', (hata as Error).message);
    }
  }
  writeFileSync(oncekiYol, JSON.stringify(sonuc));
  writeFileSync(join(CIKTI, 'yeni.json'), JSON.stringify({ uretildi: sonuc.uretildi, eslesmeler: yeni }));
  writeFileSync(join(CIKTI, 'grafik.json'), JSON.stringify(grafik));
  writeFileSync(join(CIKTI, 'ozet.json'), JSON.stringify({ uretildi: sonuc.uretildi, ortam, sayac, taranan: sonuc.taranan }));
  console.log(`Bitti: ${eslesmeler.length} eşleşme, ${yeni.length} yeni, ${hatali.length} hatalı sembol.`);
  console.table(sayac);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
