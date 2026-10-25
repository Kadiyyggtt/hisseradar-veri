import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Eslesme, GecmisDosyasi, Gosterge, GrafikVerisi, HedefDosyasi, Portfoy, TaramaSonucu } from './tipler';
import { portfoyuIlerlet } from './portfoy';
import { hedefeUlasanlar, sicilIlerlet } from './sicil';
import { gecmisIlerlet } from './gecmis';
import { yahooMumlar } from './veri/yahoo';
import { ENDEKSLER } from './veri/evren';
import type { Sicil } from './tipler';
import { ema } from './gostergeler/ortalama';
import { rsi } from './gostergeler/rsi';
import { ortamiOlc } from './ortam';
import { enAzMum, TARAYICILAR } from './stratejiler';
import { ABD, BIST, HISSE_BILGI } from './veri/evren';
import { serileriGetir } from './veri/getir';
import { hataTuru } from './veri/yahoo';
import { haftaSonuMu } from './bildirim-metin';

/**
 * TARAMA ÇALIŞTIRICISI — GitHub Actions'ta günde birkaç kez koşar, sonucu
 * docs/tarama/sonuc.json'a yazar (GitHub Pages bu klasörü yayınlar).
 * Uygulama yalnız bu dosyayı okur; telefonda hiçbir hesap yapılmaz.
 *
 * Ortam değişkenleri:
 *   SINIR=20     → her piyasadan ilk N sembol (yerel deneme için)
 *   PIYASA=BIST  → tek piyasa
 *   ESZAMANLI=4  → aynı anda kaç sembol çekilsin (kaynağa nazik: 4)
 *
 * Kaynak çökerse (hatalı sembol oranı HATA_ESIGI'ni aşarsa) hiçbir dosya yazılmaz ve
 * çıkış kodu 1 olur: yarım evrenle "yeni eşleşme" ve karne kapanışı üretilmesin.
 */
// npm betikleri proje kökünden çalışır.
const KOK = process.cwd();
const CIKTI = join(KOK, 'docs', 'tarama');

/** Hatalı sembol oranı bunu aşarsa yayın yok (Yahoo kesintisi, hız sınırı). */
export const HATA_ESIGI = 0.2;

const y2 = (n: number) => Math.round(n * 100) / 100;
const y3 = (n: number) => Math.round(n * 1000) / 1000;

/** Son mumun gösterge değerleri; tam seriden. Yetersiz veride (yeni halka arz) null. */
export function gostergeler(kapanis: number[]): Gosterge | null {
  if (kapanis.length < 60) return null;
  const son = kapanis.length - 1;
  const r = rsi(kapanis, 14)[son];
  const e12 = ema(kapanis, 12);
  const e26 = ema(kapanis, 26);
  const macd = e12.map((v, i) => v - e26[i]).filter(Number.isFinite);
  const sinyal = ema(macd, 9)[macd.length - 1];
  const e20 = ema(kapanis, 20)[son];
  const e50 = ema(kapanis, 50)[son];
  if (![r, macd[macd.length - 1], sinyal, e20, e50].every(Number.isFinite)) return null;
  return { rsi: Math.round(r * 10) / 10, macd: y3(macd[macd.length - 1]), sinyal: y3(sinyal), ema20: y2(e20), ema50: y2(e50) };
}

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
  let kisaGecmis = 0;

  // Basit eşzamanlılık: N işçi, kuyruktan çeker.
  let sira = 0;
  const isci = async () => {
    while (sira < isler.length) {
      const is = isler[sira++];
      try {
        const seriler = await serileriGetir(is.sembol, is.piyasa);
        const mumSayisi = seriler['1d'].length;
        fiyatlar.set(`${is.piyasa}:${is.sembol}`, seriler['1d'][mumSayisi - 1].k);
        {
          const g = seriler['1d'].slice(-60);
          const bilgi = HISSE_BILGI[`${is.piyasa}:${is.sembol}`];
          const gost = gostergeler(seriler['1d'].map((m) => m.k));
          grafik.seriler[`${is.piyasa}:${is.sembol}`] = {
            t0: g[0].t,
            t1: g[g.length - 1].t,
            k: g.map((m) => y2(m.k)),
            h: g.map((m) => Math.round(m.h)),
            a: g.map((m) => y2(m.a)),
            y: g.map((m) => y2(m.y)),
            d: g.map((m) => y2(m.d)),
            ...(bilgi ? { ad: bilgi.ad, sektor: bilgi.sektor } : {}),
            ...(gost ? { g: gost } : {}),
          };
        }
        // Kısa geçmişli hisse (yeni halka arz) grafiğe yazıldı; yalnız kısa seriyle çalışan tarayıcılar koşar.
        if (mumSayisi < 250) kisaGecmis++;
        for (const t of TARAYICILAR) {
          if (mumSayisi < enAzMum(t)) continue;
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
        // "BIST:CITAS:kisa": tür (yok/hiz/ag/kisa) günlükte neden düştüğünü söyler.
        hatali.push(`${is.piyasa}:${is.sembol}:${hataTuru(hata)}`);
        console.error(`  ${is.sembol}: ${(hata as Error).message}`);
      }
      bitti++;
      if (bitti % 20 === 0) console.log(`${bitti}/${isler.length}`);
    }
  };
  await Promise.all(Array.from({ length: eszamanli }, isci));

  const hataOrani = isler.length ? hatali.length / isler.length : 0;
  if (hataOrani > HATA_ESIGI) {
    const turler: Record<string, number> = {};
    for (const h of hatali) { const t = h.split(':')[2] ?? '?'; turler[t] = (turler[t] ?? 0) + 1; }
    console.error(`Hatalı sembol oranı yüzde ${Math.round(hataOrani * 100)} (${hatali.length}/${isler.length}; ${JSON.stringify(turler)}): sonuç YAYIMLANMADI.`);
    process.exit(1);
  }

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
  // Karşılaştırma geçmişi (gecmis.json): endeks kapanışları + hayali portföy değerleri, günde bir satır.
  if (sinir === Infinity && !tekPiyasa) {
    try {
      const sonKapanis = async (sembol: string) => { const m = await yahooMumlar(sembol, '1d', '10d'); return m.length ? y2(m[m.length - 1].k) : null; };
      const endeks = { xu100: await sonKapanis(ENDEKSLER.XU100).catch(() => null), spx: await sonKapanis(ENDEKSLER.SPX).catch(() => null) };
      const gecmisYol = join(CIKTI, 'gecmis.json');
      const eski = existsSync(gecmisYol) ? (JSON.parse(readFileSync(gecmisYol, 'utf8')) as GecmisDosyasi) : null;
      const gecmis = gecmisIlerlet(eski, sonuc.uretildi, endeks, sonuc.portfoy ?? null);
      writeFileSync(gecmisYol, JSON.stringify(gecmis));
      console.log(`Geçmiş: ${gecmis.gunler.length} gün; XU100 ${endeks.xu100}, SPX ${endeks.spx}.`);
    } catch (hata) {
      console.error('Geçmiş yazılamadı (tarama devam ediyor):', (hata as Error).message);
    }
  }
  // Karne (sicil.json): hata verirse taramanın geri kalanını bozmaz.
  if (sinir === Infinity && !tekPiyasa) {
    try {
      const sicilYol = join(CIKTI, 'sicil.json');
      const eski = existsSync(sicilYol) ? (JSON.parse(readFileSync(sicilYol, 'utf8')) as Sicil) : null;
      const yeniSicil = sicilIlerlet(eski, sonuc.eslesmeler, fiyatlar, sonuc.uretildi);
      writeFileSync(sicilYol, JSON.stringify(yeniSicil));
      // Hedef bildirimi: bu koşuda hedefe ulaşan kayıtlar (takipteki hisse için konu bazlı mesaj).
      const hedef: HedefDosyasi = { uretildi: sonuc.uretildi, ulasanlar: hedefeUlasanlar(yeniSicil, sonuc.uretildi, fiyatlar) };
      writeFileSync(join(CIKTI, 'hedef.json'), JSON.stringify(hedef));
      console.log(`Sicil: ${yeniSicil.acik.length} açık, ${yeniSicil.kapali.length} kapanmış kayıt; bu koşuda hedefe ulaşan ${hedef.ulasanlar.length}.`);
    } catch (hata) {
      console.error('Sicil yazılamadı (tarama devam ediyor):', (hata as Error).message);
    }
  }
  writeFileSync(oncekiYol, JSON.stringify(sonuc));
  // Hafta sonu koşusunda veri değişmez, fark boş çıkar: cuma akşamının "yeni"leri silinmesin
  // (pazartesi sabah brifingi "yeni şart oluşmadı" diyordu). bildirim.ts eski yeni.json'u yeniden göndermez.
  const yeniYol = join(CIKTI, 'yeni.json');
  if (yeni.length === 0 && haftaSonuMu(sonuc.uretildi) && existsSync(yeniYol)) console.log('Hafta sonu ve yeni eşleşme yok: yeni.json korundu.');
  else writeFileSync(yeniYol, JSON.stringify({ uretildi: sonuc.uretildi, eslesmeler: yeni }));
  writeFileSync(join(CIKTI, 'grafik.json'), JSON.stringify(grafik));
  writeFileSync(join(CIKTI, 'ozet.json'), JSON.stringify({ uretildi: sonuc.uretildi, ortam, sayac, taranan: sonuc.taranan }));
  console.log(`Bitti: ${eslesmeler.length} eşleşme, ${yeni.length} yeni, ${hatali.length} hatalı sembol, ${kisaGecmis} kısa geçmişli hisse.`);
  if (hatali.length) console.log(`Hatalı: ${hatali.join(', ')}`);
  console.table(sayac);
}

// Yalnız doğrudan çalıştırılınca (npm run tara). sina.ts `gostergeler`i içe aktarıyor; içe aktarma taramayı başlatmamalı.
if (process.argv[1]?.endsWith('calistir.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
