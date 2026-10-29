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
import { saatlikGetir } from './veri/getir';
import { ayTamamMi, gunKapanisi, gunTamamMi, haftaTamamMi, tamamlanmisSeriler } from './veri/tamamlanmis';
import { VeriHatasi } from './veri/yahoo';
import type { Mum, Seriler } from './tipler';
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
    kontrol('"0 gün önce" ve "bugün" yazılmaz: gunOnce(0) → son kapanışta', gunOnce(0) === 'son kapanışta' && gunOnce(0, true) === 'Son kapanışta' && gunOnce(3) === '3 işlem günü önce');
    {
      // Tarama yalnız kapanmış mumu gördüğü için açıklamada "bugün/dün/bu hafta/bu ay" geçmez (seans içinde yanlış olur).
      const hepsi = ['araclar.ts', 'formasyonlar.ts', 'harmonik.ts', 'klasik.ts', 'maliyet.ts', 'mumlar.ts', 'ortalamalar.ts', 'sekiller.ts'].map((d) => readFileSync(join(BURASI, 'stratejiler', d), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')).join('\n');
      const kalan = hepsi.match(/['`"][^'`"\n]*\b(bugün|Bugün|dün|Dün|bu hafta|Bu hafta|bu ay|Bu ay)\b[^'`"\n]*['`"]/g) ?? [];
      kontrol('strateji cümlelerinde bugün/dün/bu hafta/bu ay yok', kalan.length === 0, kalan.slice(0, 3));
    }
    const stratejiler = ['ortalamalar.ts', 'klasik.ts'].map((d) => readFileSync(join(BURASI, 'stratejiler', d), 'utf8')).join('\n');
    kontrol('stratejilerde çıplak "${x} gün önce" kalıbı kalmadı', !/\$\{(?!gunOnce)[^}]*\} gün önce/.test(stratejiler) && !/ gün önce'/.test(stratejiler));
  }

  // 4b. FİYAT YUVARLAMA: float32 artığı portföye/sicile girmez.
  {
    kontrol('312.4999847 → 312.5', fiyatYuvarla(312.4999847) === 312.5, fiyatYuvarla(312.4999847));
    kontrol('1 altı 4 ondalık: 0.123456 → 0.1235', fiyatYuvarla(0.123456) === 0.1235, fiyatYuvarla(0.123456));
    const kaynak = readFileSync(join(BURASI, 'calistir.ts'), 'utf8');
    kontrol('calistir fiyatlar haritasına yuvarlanmış fiyat yazar', /fiyatlar\.set\([^;]*fiyatYuvarla\(/.test(kaynak));
  }

  // 4c. TAMAMLANMIŞ MUM (29 Ekim 2026 son testi): sinyal yalnız kapanmış mumdan. Veri GERÇEK: THYAO.IS
  // günlük mumları, 13-30 Ekim 2025 (Yahoo). O ay da 28 Ekim yarım gün, 29 Ekim bayramdı. Beklenen
  // haftalık değerler elle toplandı (açılış = haftanın ilk açılışı, yüksek = en yüksek, düşük = en düşük,
  // kapanış = son kapanış, hacim = toplam).
  {
    const ham: [number, number, number, number, number, number][] = [
      [1760337000, 309.5, 312.25, 307.75, 309.0, 29718699], // Pzt 13 Eki
      [1760423400, 309.25, 310.25, 300.25, 302.0, 31639213],
      [1760509800, 302.75, 306.25, 298.0, 300.75, 41747312],
      [1760596200, 299.25, 302.0, 295.5, 296.0, 38875850],
      [1760682600, 295.0, 296.0, 287.75, 292.0, 57747825], // Cum 17 Eki
      [1760941800, 293.25, 300.25, 290.0, 297.75, 51523112], // Pzt 20 Eki
      [1761028200, 298.5, 298.75, 293.0, 294.5, 30462184],
      [1761114600, 295.5, 296.0, 287.0, 288.0, 42484656],
      [1761201000, 288.5, 290.25, 283.75, 284.25, 40555813],
      [1761287400, 287.0, 302.25, 287.0, 297.0, 84622262], // Cum 24 Eki
      [1761546600, 297.0, 298.5, 293.0, 295.0, 27751916], // Pzt 27 Eki
      [1761633000, 294.75, 295.75, 292.0, 292.0, 10268579], // Sal 28 Eki (yarım gün)
      [1761805800, 292.75, 294.75, 289.5, 290.0, 27637939], // Prş 30 Eki (29 bayram)
    ];
    const gunluk: Mum[] = ham.map(([t, a, y, d, k, h]) => ({ t, a, y, d, k, h }));
    const seri = (piyasa: 'BIST' | 'ABD', g: Mum[], saatlik: Mum[] = []): Seriler => ({ sembol: 'THYAO', piyasa, '1h': saatlik, '4h': [], '1d': g, '1w': [], '1mo': [] });
    const utc = (ay: number, gun: number, saat: number, dk = 0) => Date.UTC(2025, ay - 1, gun, saat, dk) / 1000;

    // Perşembe 30 Ekim 2025, seans içi (17:31 TR = 14:31 UTC).
    const seans = tamamlanmisSeriler(seri('BIST', gunluk), utc(10, 30, 14, 31));
    const sg = seans.seriler['1d'];
    kontrol('seans içi: oluşan günlük mum taramaya girmez, son kapanış 28 Ekim 292,00', sg.length === 12 && sg[11].t === 1761633000 && sg[11].k === 292.0 && seans.olusuyor.gun, sg[sg.length - 1]);
    kontrol('seans içi: tatil sonrası kapanış tarihi 28 Ekim (29 Ekim değil)', veriTarihiYaz(sg[sg.length - 1].t) === '2025-10-28');
    const sh = seans.seriler['1w'];
    const h1 = sh[sh.length - 2];
    const h2 = sh[sh.length - 1];
    kontrol('seans içi: oluşan hafta (27 Ekim) atılır, son hafta 20-24 Ekim', sh.length === 2 && h2.t === 1760941800 && seans.olusuyor.hafta, sh.map((m) => m.t));
    kontrol('elle: 13-17 Ekim haftası A 309,5 Y 312,25 D 287,75 K 292 H 199.728.899', h1.a === 309.5 && h1.y === 312.25 && h1.d === 287.75 && h1.k === 292.0 && h1.h === 199728899, h1);
    kontrol('elle: 20-24 Ekim haftası A 293,25 Y 302,25 D 283,75 K 297 H 249.648.027', h2.a === 293.25 && h2.y === 302.25 && h2.d === 283.75 && h2.k === 297.0 && h2.h === 249648027, h2);
    kontrol('seans içi: ay bitmeden Ekim aylık mumu taramaya girmez', seans.seriler['1mo'].length === 0 && seans.olusuyor.ay, seans.seriler['1mo']);

    // Aynı gün kapanıştan sonra (18:20 TR = 15:20 UTC): gün kapandı, hafta ve ay hâlâ açık.
    const aksam = tamamlanmisSeriler(seri('BIST', gunluk), utc(10, 30, 15, 20));
    kontrol('kapanış sonrası: 30 Ekim 290,00 kapanmış sayılır', aksam.seriler['1d'].length === 13 && aksam.seriler['1d'][12].k === 290.0 && !aksam.olusuyor.gun);
    kontrol('kapanış sonrası perşembe: hafta yine oluşuyor', aksam.olusuyor.hafta && aksam.seriler['1w'].length === 2);
    // Cumartesi 1 Kasım 2025: hafta ve Ekim ayı kapandı.
    const cmt = tamamlanmisSeriler(seri('BIST', gunluk), utc(11, 1, 10, 0));
    const h3 = cmt.seriler['1w'][2];
    kontrol('elle: 27-30 Ekim haftası A 297 Y 298,5 D 289,5 K 290 (cumartesi kapanmış)', cmt.seriler['1w'].length === 3 && h3.a === 297.0 && h3.y === 298.5 && h3.d === 289.5 && h3.k === 290.0 && !cmt.olusuyor.hafta, h3);
    const ekim = cmt.seriler['1mo'][0];
    kontrol('elle: Ekim aylık (13-30) A 309,5 Y 312,25 D 283,75 K 290 (ay kapandı)', cmt.seriler['1mo'].length === 1 && ekim.a === 309.5 && ekim.y === 312.25 && ekim.d === 283.75 && ekim.k === 290.0 && !cmt.olusuyor.ay, ekim);

    // Kenar kuralları.
    kontrol('BIST gün kapanışı 15:15 UTC (18:15 TR)', gunKapanisi('BIST', 2025, 9, 30) === utc(10, 30, 15, 15));
    kontrol('ABD yaz saati: 30 Eki 2025 kapanış 20:15 UTC', gunKapanisi('ABD', 2025, 9, 30) === utc(10, 30, 20, 15));
    kontrol('ABD kış saati: 3 Kas 2025 kapanış 21:15 UTC', gunKapanisi('ABD', 2025, 10, 3) === utc(11, 3, 21, 15));
    const abdGun = utc(11, 3, 14, 30);
    kontrol('ABD kışın 20:30 UTC seans sürüyor, 21:16 kapanmış', !gunTamamMi('ABD', abdGun, utc(11, 3, 20, 30)) && gunTamamMi('ABD', abdGun, utc(11, 3, 21, 16)));
    kontrol('hafta: cuma kapanışından 1 dk önce açık, sonra kapalı', !haftaTamamMi('BIST', 1761546600, utc(10, 31, 15, 14)) && haftaTamamMi('BIST', 1761546600, utc(10, 31, 15, 15)));
    kontrol('ay: Kasım 2025 son iş günü 28 Kasım cuma (29-30 hafta sonu)', !ayTamamMi('BIST', utc(11, 3, 6, 30), utc(11, 28, 15, 0)) && ayTamamMi('BIST', utc(11, 3, 6, 30), utc(11, 28, 15, 15)));
    const saatlik: Mum[] = [utc(10, 30, 6, 30), utc(10, 30, 7, 30), utc(10, 31, 6, 30)].map((t) => ({ t, a: 1, y: 1, d: 1, k: 1, h: 1 }));
    const s1 = tamamlanmisSeriler(seri('BIST', gunluk, saatlik), utc(10, 31, 7, 0));
    kontrol('1 saat: başlangıcından 1 saat geçmeyen mum atılır', s1.seriler['1h'].length === 2 && s1.olusuyor.saat);
    kontrol('4 saat: yalnız seansı kapanmış günlerden (31 Ekim mumu girmez)', s1.seriler['4h'].length === 2 && s1.seriler['4h'].every((m) => m.t < utc(10, 31, 0, 0)), s1.seriler['4h']);
    const kaynak = readFileSync(join(BURASI, 'calistir.ts'), 'utf8');
    kontrol('calistir: tarayıcılar tamamlanmış seriyle koşar, grafik ham seriden ve "olusuyor" işaretli', /const \{ seriler, olusuyor \} = tamamlanmisSeriler\(ham, simdi\)/.test(kaynak) && /t\.tara\(seriler, ortam\)/.test(kaynak) && /const g = ham\['1d'\]\.slice\(-60\)/.test(kaynak) && /olusuyor\.gun \? \{ olusuyor: true/.test(kaynak));
    kontrol('calistir: kapanış tarihi piyasa başına yazılır', /sonuc\.kapanis = kapanis/.test(kaynak));
    kontrol('ortam (Endeks Nabzı) yalnız kapanmış günlerden', /kapanmisGunlerinSaatlikleri\(/.test(readFileSync(join(BURASI, 'ortam.ts'), 'utf8')));
  }

  // 4d. SAATLİK VERİ 422 YEDEĞİ: iki yıldan genç hissede (EFOR, ilk işlem 5 Temmuz 2024) '730d' HTTP 422 döner.
  {
    const istekler: string[] = [];
    const sahte = async (_s: string, _a: '1h', u: string): Promise<Mum[]> => {
      istekler.push(u);
      if (u === '730d') throw new VeriHatasi('aralik', 'HTTP 422');
      return [{ t: 1, a: 1, y: 1, d: 1, k: 1, h: 1 }];
    };
    const m = await saatlikGetir('EFOR.IS', sahte);
    kontrol('422 gelince 2y ile yeniden istenir', m.length === 1 && istekler.join() === '730d,2y', istekler);
    istekler.length = 0;
    let firladi = false;
    try { await saatlikGetir('X.IS', async (_s, _a, u) => { istekler.push(u); throw new VeriHatasi('ag', 'HTTP 503'); }); } catch { firladi = true; }
    kontrol('ağ hatasında yedek denenmez, hata iletilir', firladi && istekler.join() === '730d', istekler);
    kontrol('yahoo.ts 422\'yi "aralik" sayar', /status === 422\) throw new VeriHatasi\('aralik'/.test(readFileSync(join(BURASI, 'veri', 'yahoo.ts'), 'utf8')));
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
