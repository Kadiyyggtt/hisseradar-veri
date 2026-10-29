import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import type { Eslesme, GecmisDosyasi, Gosterge, GrafikVerisi, HedefDosyasi, HedefUlasan, Portfoy, TaramaSonucu } from './tipler';
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
import { tamamlanmisSeriler } from './veri/tamamlanmis';
import { hataTuru, VeriHatasi } from './veri/yahoo';
import { haftaSonuMu, kuyrukIlerlet, sabahIlkKosuMu, type BekleyenBildirim } from './bildirim-metin';

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
/** Fiyat yuvarlama: float32 artığı (312.4999847) portföye ve sicile taşınmasın; 1'in altında 4 ondalık. */
export const fiyatYuvarla = (n: number) => (Math.abs(n) < 1 ? Math.round(n * 10000) / 10000 : y2(n));

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

/** "BIST:CITAS:kisa" → "BIST:CITAS". */
const hataliHisse = (h: string) => h.split(':').slice(0, 2).join(':');

/**
 * Bir önceki yayımlanmış sonuca göre YENİ eşleşmeler. Önceki koşuda veri hatası (kisa/yok/ag/hiz)
 * yüzünden taranamamış hisse bu koşuda geri gelince eşleşmeleri "yeni" sayılmaz: hisse dün de
 * uyuyordu, yalnız verisi inmemişti (hayalet bildirim). Önceki dosya yoksa hepsi yeni.
 */
export function yeniEslesmeler(onceki: Pick<TaramaSonucu, 'eslesmeler' | 'taranan'> | null, simdiki: Eslesme[]): Eslesme[] {
  if (!onceki) return simdiki;
  const anahtar = (e: Eslesme) => `${e.piyasa}:${e.sembol}:${e.taramaId}:${e.yon}`;
  const eski = new Set((onceki.eslesmeler ?? []).map(anahtar));
  const dunHatali = new Set((onceki.taranan?.hatali ?? []).map(hataliHisse));
  return simdiki.filter((e) => !eski.has(anahtar(e)) && !dunHatali.has(`${e.piyasa}:${e.sembol}`));
}

/**
 * Önceki koşunun yayımladığı grafik.json'dan sembol başına son mum zamanı. Kaynak gece saatlerinde
 * günlük mumları yeniden işlerken son günü geçici olarak DÜŞÜREBİLİYOR (27 Ekim 2026 00:56 UTC:
 * 445 serinin 444'ü cuma kapanışına döndü; 564 "yeni" eşleşme ve 7 sahte karne kapanışı üredi).
 */
export function sonMumlariOku(grafik: Pick<GrafikVerisi, 'seriler'> | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!grafik || typeof grafik !== 'object' || !grafik.seriler) return m;
  for (const [anahtar, seri] of Object.entries(grafik.seriler)) {
    if (seri && Number.isFinite(seri.t1) && seri.t1 > 0) m.set(anahtar, seri.t1);
  }
  return m;
}

/** Bu koşunun son mumu önceki koşunun son mumundan ESKİ mi? Önceki bilinmiyorsa ya da eşitse (hafta sonu, tatil) hayır. */
export function veriGeriMi(oncekiT1: number | undefined, simdikiT1: number): boolean {
  return oncekiT1 !== undefined && Number.isFinite(oncekiT1) && Number.isFinite(simdikiT1) && simdikiT1 < oncekiT1;
}

/** Son günlük mumun İstanbul tarihi (YYYY-MM-DD); mum yoksa undefined. */
export function veriTarihiYaz(sonMumT: number): string | undefined {
  if (!Number.isFinite(sonMumT) || sonMumT <= 0) return undefined;
  return new Date((sonMumT + 3 * 3600) * 1000).toISOString().slice(0, 10);
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

  // Geriye giden veri koruması: önceki koşunun son mumları (yoksa boş harita, koruma devre dışı).
  const oncekiGrafikYol = join(CIKTI, 'grafik.json');
  let oncekiSonMum = new Map<string, number>();
  if (existsSync(oncekiGrafikYol)) {
    try { oncekiSonMum = sonMumlariOku(JSON.parse(readFileSync(oncekiGrafikYol, 'utf8')) as GrafikVerisi); } catch { console.error('Önceki grafik.json okunamadı; geriye giden veri koruması bu koşuda devre dışı.'); }
  }

  const eslesmeler: Eslesme[] = [];
  const hatali: string[] = [];
  const sayac: Record<string, number> = {};
  /** Son kapanışlar: portföy değerlemesi için, eşleşme olmasa da. */
  const fiyatlar = new Map<string, number>();
  const grafik: GrafikVerisi = { surum: 1, uretildi: Math.floor(Date.now() / 1000), seriler: {} };
  let bitti = 0;
  let kisaGecmis = 0;
  /** Piyasa başına en son KAPANMIŞ günlük mumun zamanı (kapanis, veriTarihi). */
  const sonKapanisT: Record<'BIST' | 'ABD', number> = { BIST: 0, ABD: 0 };
  /** Tamamlanmış mum kuralının "şimdi"si: koşu boyunca sabit, bütün hisseler aynı ana göre kesilir. */
  const simdi = Math.floor(Date.now() / 1000);

  // Basit eşzamanlılık: N işçi, kuyruktan çeker.
  let sira = 0;
  const isci = async () => {
    while (sira < isler.length) {
      const is = isler[sira++];
      try {
        const ham = await serileriGetir(is.sembol, is.piyasa);
        {
          const sonT = ham['1d'][ham['1d'].length - 1].t;
          const oncekiT = oncekiSonMum.get(`${is.piyasa}:${is.sembol}`);
          if (veriGeriMi(oncekiT, sonT)) throw new VeriHatasi('eski', `son mum ${veriTarihiYaz(sonT)}, önceki koşuda ${veriTarihiYaz(oncekiT!)}: kaynak eski veri döndürdü`);
        }
        // Tarama, göstergeler, portföy ve sicil yalnız KAPANMIŞ mumları görür; oluşan mum yalnız grafikte, işaretli.
        const { seriler, olusuyor } = tamamlanmisSeriler(ham, simdi);
        const mumSayisi = seriler['1d'].length;
        if (mumSayisi === 0) throw new VeriHatasi('kisa', `${is.sembol}: kapanmış günlük mum yok`);
        fiyatlar.set(`${is.piyasa}:${is.sembol}`, fiyatYuvarla(seriler['1d'][mumSayisi - 1].k));
        sonKapanisT[is.piyasa] = Math.max(sonKapanisT[is.piyasa], seriler['1d'][mumSayisi - 1].t);
        {
          const g = ham['1d'].slice(-60);
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
            // Son mum seans içinde alındı: kapanış değil, gecikmeli fiyat. Uygulama "oluşuyor" diye gösterir.
            ...(olusuyor.gun ? { olusuyor: true as const } : {}),
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
    if (turler.eski) console.error(`Kaynak ${turler.eski} hissede önceki koşudan eski bir son mum döndürdü (gece yeniden işleme); bu koşu atlandı, sonraki koşu yeniden dener.`);
    process.exit(1);
  }
  {
    const eski = hatali.filter((h) => h.endsWith(':eski'));
    if (eski.length) console.log(`Geriye giden veri: ${eski.length} hisse bu koşuda atlandı (${eski.map(hataliHisse).join(', ')}).`);
  }

  const sonuc: TaramaSonucu = {
    surum: 1,
    uretildi: Math.floor(Date.now() / 1000),
    ortam,
    eslesmeler: eslesmeler.sort((a, b) => b.guven - a.guven || a.sembol.localeCompare(b.sembol)),
    sayac,
    taranan: { BIST: isler.filter((x) => x.piyasa === 'BIST').length, ABD: isler.filter((x) => x.piyasa === 'ABD').length, hatali },
  };
  // Piyasa başına son kapanış günü: 29 Ekim (bayram) BIST'te 28 Ekim, ABD'de 28 Ekim (seans sürüyordu).
  const kapanis: NonNullable<TaramaSonucu['kapanis']> = {};
  for (const p of ['BIST', 'ABD'] as const) { const g = veriTarihiYaz(sonKapanisT[p]); if (g) kapanis[p] = g; }
  if (Object.keys(kapanis).length) sonuc.kapanis = kapanis;
  // Eski uygulama sürümleri için tek tarih: en son KAPANMIŞ gün (artık oluşan mumdan gelmez).
  const veriTarihi = veriTarihiYaz(Math.max(sonKapanisT.BIST, sonKapanisT.ABD));
  if (veriTarihi) sonuc.veriTarihi = veriTarihi;

  mkdirSync(CIKTI, { recursive: true });
  // Bir önceki sonuçla fark: bildirim için "yeni" eşleşmeler. Portföy durumu da oradan okunur.
  const oncekiYol = join(CIKTI, 'sonuc.json');
  let yeni: Eslesme[] = sonuc.eslesmeler;
  let oncekiPortfoy: Portfoy | null = null;
  let oncekiUretildi: number | null = null;
  if (existsSync(oncekiYol)) {
    try {
      const onceki = JSON.parse(readFileSync(oncekiYol, 'utf8')) as TaramaSonucu;
      yeni = yeniEslesmeler(onceki, sonuc.eslesmeler);
      oncekiPortfoy = onceki.portfoy ?? null;
      oncekiUretildi = typeof onceki.uretildi === 'number' ? onceki.uretildi : null;
    } catch {
      /* bozuk eski dosya: hepsi yeni sayılır */
    }
  }
  const tamKosu = sinir === Infinity && !tekPiyasa;
  let ulasanlar: HedefUlasan[] = [];
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
      ulasanlar = hedefeUlasanlar(yeniSicil, sonuc.uretildi, fiyatlar);
      console.log(`Sicil: ${yeniSicil.acik.length} açık, ${yeniSicil.kapali.length} kapanmış kayıt; bu koşuda hedefe ulaşan ${ulasanlar.length}.`);
    } catch (hata) {
      console.error('Sicil yazılamadı (tarama devam ediyor):', (hata as Error).message);
    }
  }
  // Sessiz saat (22:00-08:00 TR): bu koşunun bildirimleri bekleyen.json'a birikir, sabahki ilk koşuda gider.
  // Kuyruk yalnız tam koşuda ilerler; deneme taraması (SINIR, PIYASA) kuyruğa dokunmaz.
  const bekleyenYol = join(CIKTI, 'bekleyen.json');
  let bekleyen: BekleyenBildirim | null = null;
  if (tamKosu && existsSync(bekleyenYol)) {
    try { bekleyen = JSON.parse(readFileSync(bekleyenYol, 'utf8')) as BekleyenBildirim; } catch { console.error('bekleyen.json bozuk; kuyruk boş sayıldı.'); }
  }
  const kuyruk = kuyrukIlerlet(bekleyen, yeni, ulasanlar, sonuc.eslesmeler, sonuc.uretildi);
  if (tamKosu) {
    if (kuyruk.bekleyen) writeFileSync(bekleyenYol, JSON.stringify(kuyruk.bekleyen));
    else if (existsSync(bekleyenYol)) unlinkSync(bekleyenYol);
  }
  if (kuyruk.sessiz) console.log(`Sessiz saat: ${yeni.length} yeni eşleşme ve ${ulasanlar.length} hedef bildirimi sabaha ertelendi (kuyrukta ${kuyruk.bekleyen?.eslesmeler.length ?? 0} + ${kuyruk.bekleyen?.ulasanlar.length ?? 0}).`);
  else if (bekleyen) console.log(`Gece kuyruğundan ${kuyruk.eslesmeler.length - yeni.length} eşleşme ve ${kuyruk.ulasanlar.length - ulasanlar.length} hedef bu koşuyla gidiyor.`);
  yeni = kuyruk.sessiz ? yeni : kuyruk.eslesmeler;
  if (tamKosu) {
    const hedef: HedefDosyasi = { uretildi: sonuc.uretildi, ulasanlar: kuyruk.sessiz ? ulasanlar : kuyruk.ulasanlar };
    writeFileSync(join(CIKTI, 'hedef.json'), JSON.stringify(hedef));
  }
  // Brifing iş akışında bu koşunun sonunda koşar; yalnız günün ilk sabah koşusunda gönderir.
  const sabahIlk = sabahIlkKosuMu(oncekiUretildi, sonuc.uretildi);
  writeFileSync(oncekiYol, JSON.stringify(sonuc));
  // Hafta sonu koşusunda veri değişmez, fark boş çıkar: cuma akşamının "yeni"leri silinmesin
  // (pazartesi sabah brifingi "yeni şart oluşmadı" diyordu). bildirim.ts eski yeni.json'u yeniden göndermez.
  const yeniYol = join(CIKTI, 'yeni.json');
  if (yeni.length === 0 && haftaSonuMu(sonuc.uretildi) && existsSync(yeniYol)) console.log('Hafta sonu ve yeni eşleşme yok: yeni.json korundu.');
  else writeFileSync(yeniYol, JSON.stringify({ uretildi: sonuc.uretildi, eslesmeler: yeni, sessiz: kuyruk.sessiz, sabahIlk }));
  writeFileSync(join(CIKTI, 'grafik.json'), JSON.stringify(grafik));
  writeFileSync(join(CIKTI, 'ozet.json'), JSON.stringify({ uretildi: sonuc.uretildi, ...(sonuc.veriTarihi ? { veriTarihi: sonuc.veriTarihi } : {}), ...(sonuc.kapanis ? { kapanis: sonuc.kapanis } : {}), ortam, sayac, taranan: sonuc.taranan }));
  console.log(`Veri tarihi ${sonuc.veriTarihi ?? '?'}; ${sabahIlk ? 'günün ilk sabah koşusu (brifing gider)' : 'brifing koşusu değil'}.`);
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
