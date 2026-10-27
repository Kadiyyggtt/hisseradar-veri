/**
 * ALTYAPI SINAMASI — ağsız, saf kontroller. Çalıştırma (depo kökünden ya da tarama/ altından):
 *   npx tsx tarama/src/sina-altyapi.ts
 * Çıkış kodu 1 = en az bir kontrol kırmızı.
 *
 * Kapsam: Türkçe şirket adları (evren.ts sözlüğü ve yedek düzeltici), sessiz saat ve sabah kuyruğu,
 * günün ilk sabah koşusu (brifing), hayalet "yeni" eşleşme, veri tarihi, evren aracının sözlüğü
 * korması, iş akışı zamanlaması ve iş özeti.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { kuyrukIlerlet, sabahIlkKosuMu, sessizSaatMi } from './bildirim-metin';
import { fiyatYuvarla, sonMumlariOku, veriGeriMi, veriTarihiYaz, yeniEslesmeler } from './calistir';
import { gunOnce } from './stratejiler/ortak';
import { gonder, gonderimSerbestMi, ozetYaz } from './fcm';
import type { Eslesme, HedefUlasan } from './tipler';
import { ABD_HISSELER, adDuzelt, AD_EN_COK, BIST_HISSELER, BIST_KAYNAK, HISSE_BILGI, TURKCE_AD } from './veri/evren';

const BURASI = __dirname;
const KOK = join(BURASI, '..', '..');

let kirmizi = 0;
let yesil = 0;
function kontrol(ad: string, sart: boolean, ayrinti?: unknown) {
  if (sart) { yesil++; return; }
  kirmizi++;
  console.error(`KIRMIZI: ${ad}${ayrinti === undefined ? '' : ` → ${typeof ayrinti === 'string' ? ayrinti : JSON.stringify(ayrinti)}`}`);
}

/** İstanbul saatinden unix saniye (sabit UTC+3). */
const tr = (yil: number, ay: number, gun: number, saat: number, dk = 0) => Date.UTC(yil, ay - 1, gun, saat - 3, dk) / 1000;

async function main() {
  // 1. TÜRKÇE ADLAR
  {
    const KALIP = /GAYRIMENKUL|Gida|Cimento|Celik|Ve [A-Z]/;
    const hepsi = Object.entries(HISSE_BILGI).map(([k, h]) => ({ k, ad: h.ad }));
    const kalipli = hepsi.filter((h) => KALIP.test(h.ad));
    kontrol('hiçbir adda Türkçesiz kalıp yok (GAYRIMENKUL, Gida, Cimento, Celik, "Ve X")', kalipli.length === 0, kalipli.map((h) => `${h.k} "${h.ad}"`).join(', '));
    const uzun = hepsi.filter((h) => [...h.ad].length > AD_EN_COK);
    kontrol(`ad uzunluğu ≤ ${AD_EN_COK}`, uzun.length === 0, uzun.map((h) => `${h.k} "${h.ad}" (${[...h.ad].length})`).join(', '));
    kontrol('AD_EN_COK 28', AD_EN_COK === 28);
    const ekli = hepsi.filter((h) => (h.k.startsWith('BIST:') ? /(\s|^)(AS|A\.Ş\.|A\.S\.|ANONIM|SIRKETI|Şirketi)$/ : /(\s|^)(Inc\.?|Corp\.?|Co\.?|Plc|ADR)$/).test(h.ad));
    kontrol('şirket türü eki kalmadı (AS, Inc, Corp, Co, Plc, ADR)', ekli.length === 0, ekli.map((h) => `${h.k} "${h.ad}"`).join(', '));
    const buyukHarf = hepsi.filter((h) => /[A-ZÇĞİÖŞÜ]{4,}\s[A-ZÇĞİÖŞÜ]{4,}/.test(h.ad));
    kontrol('tamamı büyük harfli ad kalmadı', buyukHarf.length === 0, buyukHarf.map((h) => h.ad).join(', '));
    const sozluksuz = BIST_KAYNAK.filter((h) => !TURKCE_AD[h.kod]).map((h) => h.kod);
    kontrol('her BIST sembolünün elle yazılmış Türkçe adı var', sozluksuz.length === 0, sozluksuz.join(', '));
    const sozlukUzun = Object.entries(TURKCE_AD).filter(([, a]) => [...a].length > AD_EN_COK || KALIP.test(a) || a.trim() !== a || a.length < 2);
    kontrol('sözlük girdileri kurala uyar', sozlukUzun.length === 0, sozlukUzun.map(([k, a]) => `${k} "${a}"`).join(', '));
    const beklenen: Record<string, string> = { BALSU: 'Balsu Gıda', KARCL: 'Kardemir Çelik', CELHA: 'Çelik Halat ve Tel', ISKPL: 'Işık Plastik', ADGYO: 'Adra GYO', THYAO: 'Türk Hava Yolları' };
    for (const [kod, ad] of Object.entries(beklenen)) kontrol(`BIST:${kod} adı "${ad}"`, HISSE_BILGI[`BIST:${kod}`]?.ad === ad, HISSE_BILGI[`BIST:${kod}`]?.ad);
    kontrol('BIST_HISSELER adı sözlükten', BIST_HISSELER.find((h) => h.kod === 'BALSU')?.ad === 'Balsu Gıda');
    kontrol('ABD adı sade: Apple, Exxon Mobil, Accenture, Arm Holdings', ['AAPL:Apple', 'XOM:Exxon Mobil', 'ACN:Accenture', 'ARM:Arm Holdings', 'MDT:Medtronic', 'ETN:Eaton'].every((x) => {
      const [kod, ad] = x.split(':');
      return ABD_HISSELER.find((h) => h.kod === kod)?.ad === ad;
    }), ABD_HISSELER.filter((h) => ['AAPL', 'XOM', 'ACN', 'ARM', 'MDT', 'ETN'].includes(h.kod)).map((h) => h.ad));

    // Yedek düzeltici: sözlükte olmayan yeni sembolün kaynak adı.
    const durumlar: [string, 'BIST' | 'ABD', string][] = [
      ['ADRA GAYRIMENKUL YATIRIM ORTAKLIGI', 'BIST', 'Adra GYO'],
      ['Balsu Gida', 'BIST', 'Balsu Gıda'],
      ['Kardemir Celik AS', 'BIST', 'Kardemir Çelik'],
      ['Çelik Halat Ve Tel', 'BIST', 'Çelik Halat ve Tel'],
      ['Işık Plastik Ve Dış', 'BIST', 'Işık Plastik ve Dış'],
      ['EBEBEK MAGAZACILIK ANONIM SIRKETI', 'BIST', 'Ebebek Mağazacılık'],
      ['İSKENDERUN DEMİR VE ÇELİK', 'BIST', 'İskenderun Demir ve Çelik'],
      ['FUZUL GAYRIMENKUL YATIRIM ORTAKLIGI', 'BIST', 'Fuzul GYO'],
      ['Oba Makarnacilik A. S.', 'BIST', 'Oba Makarnacılık'],
      ['Best Brands Grup Enerji Yatirim as', 'BIST', 'Best Brands Grup Enerji'],
      ['KATILIMEVIM TASARRUF FINANSMAN', 'BIST', 'Katılımevim Tasarruf'],
      ['CarrefourSA Carrefour Sabancı', 'BIST', 'CarrefourSA Carrefour'],
      ['TR Dogal Enerji Kaynaklari Arastirma', 'BIST', 'TR Doğal Enerji Kaynakları'],
      ['Apple Inc.', 'ABD', 'Apple'],
      ['Exxon Mobil Corporation', 'ABD', 'Exxon Mobil'],
      ['The Coca-Cola Co', 'ABD', 'Coca-Cola'],
      ['Accenture Plc', 'ABD', 'Accenture'],
      ['ARM Holdings Sponsored ADR', 'ABD', 'ARM Holdings'],
      ['Tesla, Inc.', 'ABD', 'Tesla'],
    ];
    for (const [ham, piyasa, istenen] of durumlar) {
      const cikti = adDuzelt(ham, piyasa);
      kontrol(`adDuzelt("${ham}") → "${istenen}"`, cikti === istenen, cikti);
      kontrol(`adDuzelt("${ham}") kalıpsız ve ≤ 28`, !KALIP.test(cikti) && [...cikti].length <= AD_EN_COK, cikti);
    }
  }

  // 2. SESSİZ SAAT VE SABAH KUYRUĞU
  {
    const gece = tr(2026, 10, 27, 2, 30);
    const sabah = tr(2026, 10, 27, 9, 10);
    kontrol('02:30 TR sessiz', sessizSaatMi(gece));
    kontrol('09:10 TR sessiz değil', !sessizSaatMi(sabah));
    kontrol('sınırlar: 21:59 açık, 22:00 sessiz, 07:59 sessiz, 08:00 açık',
      !sessizSaatMi(tr(2026, 10, 27, 21, 59)) && sessizSaatMi(tr(2026, 10, 27, 22, 0)) && sessizSaatMi(tr(2026, 10, 27, 7, 59)) && !sessizSaatMi(tr(2026, 10, 27, 8, 0)));
    kontrol('tarama payı: 21:50 TR sessiz sayılır (bildirim adımı 22:00\'ı geçmesin), 21:40 sayılmaz',
      sessizSaatMi(tr(2026, 10, 27, 21, 50), 15) && !sessizSaatMi(tr(2026, 10, 27, 21, 40), 15));
    kontrol('FCM kapısı: 02:30 TR gönderilmez', !gonderimSerbestMi(gece * 1000));
    kontrol('FCM kapısı: 09:10 TR gönderilir', gonderimSerbestMi(sabah * 1000));

    // gonder() sessiz saatte ağa hiç çıkmaz.
    const eskiFetch = globalThis.fetch;
    const eskiNow = Date.now;
    let istek = 0;
    globalThis.fetch = (async () => { istek++; return new Response('{}', { status: 200 }); }) as typeof fetch;
    const log = console.error;
    const log2 = console.log;
    try {
      console.error = () => {};
      console.log = () => {};
      Date.now = () => gece * 1000;
      const sonucGece = await gonder({ project_id: 'p', client_email: 'e', private_key: 'k', token_uri: 'u' }, 'a', 'konu', { baslik: 'b', govde: 'g' }, {});
      kontrol('gonder 02:30 TR: false ve istek yok', sonucGece === false && istek === 0, { sonucGece, istek });
      Date.now = () => sabah * 1000;
      const sonucSabah = await gonder({ project_id: 'p', client_email: 'e', private_key: 'k', token_uri: 'u' }, 'a', 'konu', { baslik: 'b', govde: 'g' }, {});
      kontrol('gonder 09:10 TR: istek gider', sonucSabah === true && istek === 1, { sonucSabah, istek });
    } finally {
      globalThis.fetch = eskiFetch;
      Date.now = eskiNow;
      console.error = log;
      console.log = log2;
    }

    const es = (sembol: string, taramaId = 'qm'): Eslesme => ({ sembol, piyasa: 'BIST', taramaId, yon: 'al', guven: 90, periyot: '1d', aciklama: [], t: 0, fiyat: 10 });
    const ul = (sembol: string): HedefUlasan => ({ sembol, piyasa: 'BIST', taramaId: 'qm', giris: 10, hedef: 11, t: 100, sonuc: 'ulasti', bitis: 200, fiyat: 11 });
    const geceKosu = tr(2026, 10, 27, 0, 53);
    const k1 = kuyrukIlerlet(null, [es('AAA'), es('CCC')], [ul('UUU')], [es('AAA'), es('CCC')], geceKosu);
    kontrol('gece koşusu: sessiz, kuyrukta 2 eşleşme + 1 hedef', k1.sessiz && k1.bekleyen?.eslesmeler.length === 2 && k1.bekleyen.ulasanlar.length === 1, k1);
    const k1b = kuyrukIlerlet(k1.bekleyen, [es('AAA'), es('DDD')], [ul('UUU')], [], tr(2026, 10, 27, 3, 0));
    kontrol('ikinci gece koşusu kuyruğa tekrar eklemez', k1b.bekleyen?.eslesmeler.map((e) => e.sembol).join() === 'AAA,CCC,DDD' && k1b.bekleyen.ulasanlar.length === 1, k1b.bekleyen);
    // Sabah: CCC artık uymuyor (gönderilmez), AAA uyuyor; BBB bu koşunun yenisi.
    const k2 = kuyrukIlerlet(k1.bekleyen, [es('BBB')], [], [es('AAA'), es('BBB')], tr(2026, 10, 27, 10, 23));
    kontrol('sabah koşusu: gece birikeni gider, kuyruk boşalır', !k2.sessiz && k2.bekleyen === null && k2.eslesmeler.map((e) => e.sembol).sort().join() === 'AAA,BBB' && k2.ulasanlar.length === 1, k2);
    kontrol('sabah artık uymayan gece eşleşmesi gönderilmez', !k2.eslesmeler.some((e) => e.sembol === 'CCC'));
    const k3 = kuyrukIlerlet(null, [es('EEE')], [], [es('EEE')], tr(2026, 10, 27, 13, 53));
    kontrol('gündüz koşusu kuyruksuz: yalnız kendi yenisi', !k3.sessiz && k3.eslesmeler.length === 1 && k3.bekleyen === null);

    // Günün ilk sabah koşusu (brifing).
    const pzt = (s: number, d = 0) => tr(2026, 10, 26, s, d); // 26 Ekim 2026 pazartesi
    kontrol('ilk sabah: önceki gece 00:53 → 10:23 ilk', sabahIlkKosuMu(pzt(0, 53), pzt(10, 23)));
    kontrol('ilk sabah: cron 5 saat gecikse de (15:10) önceki gece ise ilk', sabahIlkKosuMu(pzt(0, 53), pzt(15, 10)));
    kontrol('ilk sabah değil: önceki 10:23 → 13:53', !sabahIlkKosuMu(pzt(10, 23), pzt(13, 53)));
    kontrol('ilk sabah değil: gece 00:53 koşusu (sessiz)', !sabahIlkKosuMu(tr(2026, 10, 25, 18, 23), pzt(0, 53)));
    kontrol('ilk sabah değil: cumartesi', !sabahIlkKosuMu(tr(2026, 10, 23, 18, 0), tr(2026, 10, 24, 10, 23)));
    kontrol('ilk sabah: önceki dosya yok', sabahIlkKosuMu(null, pzt(10, 23)));
  }

  // 3. HAYALET "YENİ": önceki koşuda hatalı olan hisse geri gelince yeni sayılmaz.
  {
    const es = (sembol: string, taramaId = 'qm'): Eslesme => ({ sembol, piyasa: 'BIST', taramaId, yon: 'al', guven: 90, periyot: '1d', aciklama: [], t: 0, fiyat: 10 });
    const onceki = { eslesmeler: [es('THYAO')], taranan: { BIST: 3, ABD: 0, hatali: ['BIST:SISE:kisa', 'BIST:ASELS:ag'] } };
    const simdi = [es('THYAO'), es('SISE'), es('SISE', 'bayrak'), es('ASELS'), es('EREGL')];
    const yeni = yeniEslesmeler(onceki, simdi);
    kontrol('dün hatalı (kisa/ag) hisse bugün "yeni" değil', yeni.map((e) => e.sembol).join() === 'EREGL', yeni.map((e) => `${e.sembol}:${e.taramaId}`));
    const temiz = yeniEslesmeler({ ...onceki, taranan: { ...onceki.taranan, hatali: [] } }, simdi);
    kontrol('dün hatalı değilse yeni sayılır', temiz.length === 4, temiz.length);
    kontrol('önceki dosya yoksa hepsi yeni', yeniEslesmeler(null, simdi).length === 5);
    kontrol('başka piyasadaki aynı kod etkilenmez', yeniEslesmeler({ eslesmeler: [], taranan: { BIST: 0, ABD: 1, hatali: ['ABD:SISE:yok'] } }, [es('SISE')]).length === 1);
  }

  // 4. VERİ TARİHİ (son mum, İstanbul günü)
  {
    kontrol('BIST mumu 24 Eki 07:00 UTC → 2026-10-24', veriTarihiYaz(Date.UTC(2026, 9, 24, 7, 0) / 1000) === '2026-10-24');
    kontrol('ABD mumu 23 Eki 13:30 UTC → 2026-10-23', veriTarihiYaz(Date.UTC(2026, 9, 23, 13, 30) / 1000) === '2026-10-23');
    kontrol('22:00 UTC mumu İstanbul\'da ertesi gün → 2026-10-24', veriTarihiYaz(Date.UTC(2026, 9, 23, 22, 0) / 1000) === '2026-10-24');
    kontrol('mum yoksa tarih yok', veriTarihiYaz(0) === undefined);
  }

  // 4a. GERİYE GİDEN VERİ: kaynak önceki koşudan eski son mum döndürürse hisse "eski" sayılır (27 Ekim 2026 gecesi).
  {
    const cuma = Date.UTC(2026, 9, 23, 6, 30) / 1000;
    const pazartesi = Date.UTC(2026, 9, 26, 6, 30) / 1000;
    kontrol('son mum pazartesiden cumaya dönerse geri', veriGeriMi(pazartesi, cuma));
    kontrol('son mum aynıysa (hafta sonu, tatil) geri değil', !veriGeriMi(pazartesi, pazartesi));
    kontrol('son mum ilerlediyse geri değil', !veriGeriMi(cuma, pazartesi));
    kontrol('önceki bilinmiyorsa geri değil', !veriGeriMi(undefined, cuma));
    kontrol('önceki NaN ise geri değil', !veriGeriMi(Number.NaN, cuma));
    const harita = sonMumlariOku({ seriler: { 'BIST:THYAO': { t0: 1, t1: pazartesi, k: [], h: [] }, 'ABD:AAPL': { t0: 1, t1: 0, k: [], h: [] } } } as never);
    kontrol('grafik.json\'dan son mumlar okunur, t1=0 atlanır', harita.get('BIST:THYAO') === pazartesi && !harita.has('ABD:AAPL') && sonMumlariOku(null).size === 0);
    const kaynak = readFileSync(join(BURASI, 'calistir.ts'), 'utf8');
    kontrol('calistir geri giden hisseyi VeriHatasi("eski") ile hatalı sayar', /veriGeriMi\(oncekiT, sonT\)\) throw new VeriHatasi\('eski'/.test(kaynak));
    kontrol('calistir önceki grafik.json\'u koruma için okur', /sonMumlariOku\(JSON\.parse\(readFileSync\(oncekiGrafikYol/.test(kaynak));
    kontrol('yahoo.ts hata türleri "eski"yi içerir', /'kisa' \| 'eski'/.test(readFileSync(join(BURASI, 'veri', 'yahoo.ts'), 'utf8')));
    kontrol('"0 gün önce" yazılmaz: gunOnce(0) → bugün', gunOnce(0) === 'bugün' && gunOnce(0, true) === 'Bugün' && gunOnce(3) === '3 gün önce');
    const stratejiler = ['ortalamalar.ts', 'klasik.ts'].map((d) => readFileSync(join(BURASI, 'stratejiler', d), 'utf8')).join('\n');
    kontrol('stratejilerde çıplak "${x} gün önce" kalıbı kalmadı', !/\$\{(?!gunOnce)[^}]*\} gün önce/.test(stratejiler));
  }

  // 4b. FİYAT YUVARLAMA: float32 artığı portföye/sicile girmez.
  {
    kontrol('312.4999847 → 312.5', fiyatYuvarla(312.4999847) === 312.5, fiyatYuvarla(312.4999847));
    kontrol('1 altı 4 ondalık: 0.123456 → 0.1235', fiyatYuvarla(0.123456) === 0.1235, fiyatYuvarla(0.123456));
    const kaynak = readFileSync(join(BURASI, 'calistir.ts'), 'utf8');
    kontrol('calistir fiyatlar haritasına yuvarlanmış fiyat yazar', /fiyatlar\.set\([^;]*fiyatYuvarla\(/.test(kaynak));
  }

  // 5. EVREN ARACI: Türkçe ad sözlüğünü ezmez, dosyayı birebir yeniden üretir.
  {
    const arac = (await import(join(KOK, 'tarama', 'arac', 'evren-guncelle.mjs') as string)) as {
      korunanBlok: (s: string) => string;
      sozlukOku: (s: string) => Map<string, string>;
      evrenMetni: (o: { tarih: string; bist: { kod: string; ad: string; sektor: string }[]; abd: { kod: string; ad: string; sektor: string }[]; blok: string }) => string;
    };
    const dosya = readFileSync(join(BURASI, 'veri', 'evren.ts'), 'utf8');
    const blok = arac.korunanBlok(dosya);
    const sozluk = arac.sozlukOku(blok);
    kontrol('araç sözlüğü eksiksiz okur', sozluk.size === Object.keys(TURKCE_AD).length && sozluk.get('BALSU') === 'Balsu Gıda', sozluk.size);
    let hata = '';
    try { arac.korunanBlok('export const X = 1;'); } catch (e) { hata = (e as Error).message; }
    kontrol('sözlük bloğu yoksa araç yazmaz (hata)', /bulunamadı/.test(hata));
    const metin = arac.evrenMetni({
      tarih: '2026-12-31',
      bist: [{ kod: 'BALSU', ad: 'Balsu Gida', sektor: 'Tüketim Ürünleri' }, { kod: 'YENIX', ad: 'YENI SIRKET AS', sektor: 'Diğer' }],
      abd: [{ kod: 'AAPL', ad: 'Apple', sektor: 'Elektronik ve Savunma Teknolojisi' }],
      blok,
    });
    kontrol('yeniden üretimde sözlük bloğu birebir', metin.includes(blok));
    kontrol('sözlükteki sembolün adı kaynak adıyla ezilmez', metin.includes(`{ kod: 'BALSU', ad: "Balsu Gıda"`) && !metin.includes('Balsu Gida'));
    kontrol('sözlükte olmayan sembol kaynak adıyla yazılır (gösterimde adDuzelt)', metin.includes(`{ kod: 'YENIX', ad: "YENI SIRKET AS"`));
    const liste = (ad: string) => {
      const bas = dosya.indexOf(`export const ${ad}: Hisse[] = [`);
      const son = dosya.indexOf('];', bas);
      return [...dosya.slice(bas, son).matchAll(/\{ kod: '([A-Z0-9-]+)', ad: ("[^"]*"), sektor: ("[^"]*") \}/g)].map((m) => ({ kod: m[1], ad: JSON.parse(m[2]) as string, sektor: JSON.parse(m[3]) as string }));
    };
    const tarih = dosya.match(/Son üretim: (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
    const yeniden = arac.evrenMetni({ tarih, bist: liste('BIST_KAYNAK'), abd: liste('ABD_KAYNAK'), blok });
    kontrol('evren.ts araçla birebir yeniden üretilir (elle bozulmamış)', yeniden === dosya, 'fark var');
  }

  // 6. İŞ AKIŞI ZAMANLAMASI VE İŞ ÖZETİ
  {
    const tarama = readFileSync(join(KOK, '.github', 'workflows', 'tarama.yml'), 'utf8');
    const brifing = readFileSync(join(KOK, '.github', 'workflows', 'brifing.yml'), 'utf8');
    const cronlar = (yml: string) => [...yml.matchAll(/cron:\s*'(\d+) (\d+) [^']*'/g)].map((m) => ({ dk: Number(m[1]), saat: Number(m[2]), tam: m[0] }));
    const tc = cronlar(tarama);
    kontrol('tarama: 4 cron', tc.length === 4, tc.map((c) => c.tam));
    const yogun = [...tc, ...cronlar(brifing)].filter((c) => c.dk % 15 === 0 || c.dk % 5 === 0);
    kontrol('cron dakikaları yoğun dakikada değil (5\'in katı yok)', yogun.length === 0, yogun.map((c) => c.tam));
    kontrol('gece ABD kapanış koşusu 21 UTC\'de duruyor', tc.some((c) => c.saat === 21));
    const isler = (yml: string) => yml.split(/\n {2}[a-z-]+:\n {4}runs-on/).length - 1;
    const isZaman = (yml: string) => (yml.match(/\n {4}timeout-minutes: \d+/g) ?? []).length;
    kontrol('her işin timeout-minutes değeri var', isler(tarama) === isZaman(tarama) && isler(brifing) === isZaman(brifing), { tarama: [isler(tarama), isZaman(tarama)], brifing: [isler(brifing), isZaman(brifing)] });
    const adimlar = (yml: string) => yml.split('\n      - ').slice(1);
    const zamansiz = [...adimlar(tarama), ...adimlar(brifing)].filter((a) => /run:/.test(a) && !/timeout-minutes:/.test(a) && !/^name: Tür/.test(a));
    kontrol('komut çalıştıran her adımın timeout-minutes değeri var', zamansiz.length === 0, zamansiz.map((a) => a.split('\n')[0]));
    const iBildir = tarama.indexOf('npm run bildir');
    const iBrifing = tarama.indexOf('npm run brifing -- sabah');
    kontrol('sabah brifingi tarama iş akışında, bildirimden sonra, ILK_KOSU şartıyla', iBildir > 0 && iBrifing > iBildir && /ILK_KOSU: '1'/.test(tarama.slice(iBrifing)));
    kontrol('brifing.yml hafta içi sabah cron\'u yok (yalnız pazar + elle)', !/cron:\s*'[^']*1-5'/.test(brifing) && cronlar(brifing).length === 1 && /workflow_dispatch/.test(brifing));
    kontrol('tarama push adımı silinen bekleyen.json\'u da yayımlar', /git add -A docs\/tarama/.test(tarama));
    const readme = readFileSync(join(KOK, 'README.md'), 'utf8');
    kontrol('README: "09:45" vaadi yok, "hafta içi sabah" var', !/09:45|06:45/.test(readme) && /hafta içi sabah/.test(readme));

    const gecici = mkdtempSync(join(tmpdir(), 'hr-ozet-'));
    const eski = process.env.GITHUB_STEP_SUMMARY;
    const log = console.log;
    try {
      process.env.GITHUB_STEP_SUMMARY = join(gecici, 'ozet.md');
      console.log = () => {};
      ozetYaz('### Bildirim GÖNDERİLMEDİ');
      kontrol('ozetYaz iş özetine yazar', readFileSync(join(gecici, 'ozet.md'), 'utf8') === '### Bildirim GÖNDERİLMEDİ\n');
    } finally {
      console.log = log;
      if (eski === undefined) delete process.env.GITHUB_STEP_SUMMARY; else process.env.GITHUB_STEP_SUMMARY = eski;
      rmSync(gecici, { recursive: true, force: true });
    }
    const bildirimKaynak = readFileSync(join(BURASI, 'bildirim.ts'), 'utf8');
    const bos = bildirimKaynak.slice(bildirimKaynak.indexOf('if (!hesap)'), bildirimKaynak.indexOf('if (!hesap)') + 400);
    kontrol('FCM gizli değeri yoksa bildirim.ts iş özetine yazar (::warning değil)', /ozetYaz\(/.test(bos) && !/::warning/.test(bos) && /FCM_SERVIS_HESABI/.test(bos));
    const brifingKaynak = readFileSync(join(BURASI, 'brifing.ts'), 'utf8');
    kontrol('brifing.ts gizli değer yoksa iş özetine yazar', /if \(!hesap\) \{ ozetYaz\(/.test(brifingKaynak));
  }

  console.log(`Altyapı sınaması: ${yesil} yeşil, ${kirmizi} kırmızı.`);
  process.exit(kirmizi ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
