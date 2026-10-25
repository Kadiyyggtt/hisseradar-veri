#!/usr/bin/env node
/**
 * EVREN GÜNCELLEYİCİ — tarama/src/veri/evren.ts dosyasını yeniden üretir.
 * Çeyrekte bir çalıştırılır (endeks ve likidite değişir):
 *
 *   node tarama/arac/evren-guncelle.mjs            # yazar
 *   node tarama/arac/evren-guncelle.mjs --kuru     # yalnız sayar, yazmaz
 *
 * Kaynaklar (ikisi de herkese açık, anahtar istemez):
 *   · TradingView tarayıcı uç noktası: BIST'teki bütün paylar, 30 günlük ortalama
 *     hacim, kapanış, piyasa değeri, sektör (İngilizce). Seçim ölçütü buradan.
 *   · Türkçe Vikipedi "Borsa İstanbul'da işlem gören şirketler listesi": kısa
 *     Türkçe şirket adı. Orada olmayan için TradingView adı sadeleştirilir.
 *
 * Seçim kuralı (BIST): günlük ortalama ciro ≥ 30 milyon ₺ YA DA piyasa değeri
 * ≥ 10 milyar ₺. İşlem görmeyen (tedbirli, askıda) semboller veri kaynağında
 * görünmediği için kendiliğinden düşer. ABD listesi sabittir; yalnız adı çekilir.
 *
 * Yahoo süzgeci (tarama Yahoo'dan okur): her BIST adayı Yahoo'da sınanır. Yahoo'da
 * olmayan (404: ALTIN, DMLKT gibi sertifikalar), türü hisse olmayan ya da 60'tan az
 * günlük mumu olan (yeni halka arz) sembol listeye girmez; her koşuda "hatalı" sayılıyordu.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KURU = process.argv.includes('--kuru');
const KOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEDEF = join(KOK, 'tarama', 'src', 'veri', 'evren.ts');
const CIRO_ESIK = 30e6;
const DEGER_ESIK = 10e9;
/** Taramanın kısa geçmişli hisseyi grafiğe yazdığı alt sınır (tarama/src/veri/getir.ts EN_AZ_MUM ile aynı). */
const EN_AZ_MUM = 60;
/** TradingView'de "stock/common" görünen ama hisse olmayan semboller (altın ve gümüş sertifikaları). Yahoo süzgecine ek güvence. */
const SERTIFIKA = new Set(['ALTIN', 'DMLKT']);
/** Asılı kalan istek aracı kilitlemesin. */
const ZAMAN_ASIMI_MS = 15000;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const SEKTOR_TR = {
  'Commercial Services': 'Ticari Hizmetler', Communications: 'İletişim', 'Consumer Durables': 'Dayanıklı Tüketim',
  'Consumer Non-Durables': 'Tüketim Ürünleri', 'Consumer Services': 'Tüketici Hizmetleri', 'Distribution Services': 'Dağıtım ve Toptan Ticaret',
  'Electronic Technology': 'Elektronik ve Savunma Teknolojisi', 'Energy Minerals': 'Petrol ve Enerji', Finance: 'Finans',
  'Health Services': 'Sağlık Hizmetleri', 'Health Technology': 'İlaç ve Sağlık Teknolojisi', 'Industrial Services': 'İnşaat ve Endüstriyel Hizmetler',
  Miscellaneous: 'Diğer', 'Non-Energy Minerals': 'Madencilik ve Metal', 'Process Industries': 'Kimya ve Proses Sanayi',
  'Producer Manufacturing': 'Makine ve İmalat', 'Retail Trade': 'Perakende', 'Technology Services': 'Yazılım ve Teknoloji Hizmetleri',
  Transportation: 'Ulaştırma', Utilities: 'Elektrik ve Altyapı',
};

/** ABD listesi sabit: S&P 100 çekirdeği + Nasdaq'ın en bilinenleri. TradingView borsa önekleri. */
const ABD_SABIT = `NASDAQ:AAPL NASDAQ:MSFT NASDAQ:NVDA NASDAQ:AMZN NASDAQ:GOOGL NASDAQ:META NASDAQ:TSLA NYSE:BRK.B NASDAQ:AVGO NYSE:JPM NYSE:LLY NYSE:V NYSE:UNH NYSE:XOM NYSE:MA NASDAQ:COST NYSE:HD NYSE:PG NYSE:JNJ NASDAQ:NFLX
NYSE:ABBV NYSE:WMT NYSE:BAC NYSE:CRM NYSE:KO NYSE:CVX NYSE:ORCL NYSE:MRK NASDAQ:AMD NASDAQ:PEP NASDAQ:ADBE NASDAQ:CSCO NYSE:TMO NYSE:ACN NASDAQ:LIN NYSE:MCD NYSE:ABT NYSE:GE NYSE:WFC NASDAQ:TXN
NYSE:DHR NYSE:PM NASDAQ:INTU NYSE:IBM NASDAQ:QCOM NYSE:CAT NYSE:VZ NASDAQ:AMGN NASDAQ:ISRG NYSE:NOW NYSE:DIS NYSE:GS NYSE:SPGI NYSE:PFE NYSE:UBER NYSE:RTX NASDAQ:AMAT NASDAQ:CMCSA NYSE:NEE NASDAQ:BKNG
NYSE:LOW NYSE:T NASDAQ:HON NYSE:UNP NYSE:PGR NYSE:AXP NYSE:BLK NYSE:ETN NYSE:TJX NYSE:SYK NYSE:COP NYSE:BSX NYSE:MS NASDAQ:VRTX NASDAQ:ADP NASDAQ:PANW NASDAQ:LRCX NYSE:MDT NYSE:SCHW NASDAQ:GILD
NYSE:C NASDAQ:MU NASDAQ:ADI NYSE:MRSH NYSE:BX NASDAQ:PLTR NASDAQ:KLAC NYSE:ANET NYSE:CB NASDAQ:SBUX NYSE:DE NASDAQ:FISV NYSE:SO NYSE:MO NYSE:PLD NYSE:ICE NYSE:DUK NYSE:BMY NASDAQ:INTC NYSE:SHW
NASDAQ:CRWD NASDAQ:SNPS NASDAQ:CDNS NASDAQ:MELI NASDAQ:MRVL NASDAQ:ABNB NASDAQ:COIN NASDAQ:MSTR NASDAQ:ARM NASDAQ:SMCI`.split(/\s+/).filter(Boolean);

async function tvTara(pazar, govde) {
  const c = await fetch(`https://scanner.tradingview.com/${pazar}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (HisseRadar evren)', Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
  if (!c.ok) throw new Error(`TradingView ${pazar}: HTTP ${c.status}`);
  const j = await c.json();
  if (!Array.isArray(j.data) || j.data.length === 0) throw new Error(`TradingView ${pazar}: boş cevap`);
  return j.data;
}

/** Yahoo'nun İngilizce sektör adları (TradingView'den farklı sözlük). */
const YAHOO_SEKTOR_TR = {
  Technology: 'Yazılım ve Teknoloji Hizmetleri', 'Financial Services': 'Finans', Healthcare: 'İlaç ve Sağlık Teknolojisi',
  'Consumer Cyclical': 'Tüketici Hizmetleri', 'Consumer Defensive': 'Perakende', Industrials: 'Makine ve İmalat', Energy: 'Petrol ve Enerji',
  Utilities: 'Elektrik ve Altyapı', 'Communication Services': 'İletişim', 'Real Estate': 'Finans', 'Basic Materials': 'Kimya ve Proses Sanayi',
};

async function yahooAd(kod) {
  const c = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(kod)}&quotesCount=3&newsCount=0`, { headers: { 'User-Agent': 'Mozilla/5.0 (HisseRadar evren)' }, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  if (!c.ok) return null;
  const j = await c.json();
  const q = (j.quotes ?? []).find((x) => x.symbol === kod && x.quoteType === 'EQUITY');
  if (!q) return null;
  return { ad: sadelestir(q.longname ?? q.shortname ?? kod), sektor: YAHOO_SEKTOR_TR[q.sector] ?? 'Diğer' };
}

async function vikipediAdlari() {
  const url = "https://tr.wikipedia.org/w/api.php?action=parse&page=Borsa_%C4%B0stanbul%27da_i%C5%9Flem_g%C3%B6ren_%C5%9Firketler_listesi&prop=wikitext&format=json";
  const c = await fetch(url, { headers: { 'User-Agent': 'HisseRadar evren guncelleyici (github.com/Kadiyyggtt/hisseradar-veri)' }, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
  if (!c.ok) throw new Error(`Vikipedi: HTTP ${c.status}`);
  const metin = (await c.json()).parse?.wikitext?.['*'];
  if (typeof metin !== 'string') throw new Error('Vikipedi: beklenen biçim değil');
  const adlar = new Map();
  for (const satir of metin.split(/\n\|-\s*\n/)) {
    const hucreler = ('\n' + satir).split(/\n\|/).map((h) => h.trim()).filter(Boolean);
    if (hucreler.length < 2 || !/^[A-Z]{3,6}$/.test(hucreler[0])) continue;
    const ham = hucreler[1];
    const bag = ham.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    adlar.set(hucreler[0], sadelestir(bag ? (bag[2] ?? bag[1]) : ham.replace(/\[\[|\]\]/g, '')));
  }
  if (adlar.size < 300) throw new Error(`Vikipedi: yalnız ${adlar.size} ad bulundu, sayfa değişmiş olabilir`);
  return adlar;
}

/**
 * "Türk Hava Yolları A.O." → "Türk Hava Yolları"; "Aselsan Elektronik Sanayi ve Ticaret A.Ş." → "Aselsan Elektronik".
 * Şirket türü ekleri ve faaliyet kalıpları düşer; TradingView'in ASCII adları da buradan geçer.
 * JS'te \b Türkçe harfle çalışmaz: sınır boşlukla elle kurulur.
 */
const EKLER = ['Anonim Ortaklığı', 'Anonim Ortakligi', 'Anonim Şirketi', 'Anonim Sirketi', 'T.A.Ş.', 'T.A.S.', 'A.Ş.', 'A.S.', 'A.Ş', 'A.S', 'A.O.', 'A.O',
  'Incorporated', 'Inc.', 'Inc', 'Corporation', 'Corp.', 'Corp', 'Company', 'Co.', 'Aktiengesellschaft', 'N.V.', 'S.A.', 'PLC', 'plc', 'Ltd.', 'Limited',
  'Common Stock', 'Class A', 'Class B', 'Class C', 'Aktıengesellschaft', 'AG'];
const KALIPLAR = ['Sanayi ve Ticaret', 'Sanayi Ve Ticaret', 'Ticaret ve Sanayi', 'Ticaret Ve Sanayi', 'San. ve Tic.', 'San. Ve Tic.', 'San. Tic.', 'Sanayii', 'Sanayi', 'Ticaret', 'Tic.', 'San.',
  'Taahhüt', 'Taahhut', 'İşletmeleri', 'Isletmeleri', 'Üretim', 'Uretim', 'Toptan', 'Pazarlama', 'Companies'];
const kacir = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sadelestir(ad) {
  let s = ` ${ad.replace(/\s*\(.*?\)\s*/g, ' ').replace(/Gayrimenkul Yat[ıi]r[ıi]m Ortakl[ıi][ğg][ıi]/g, 'GYO')} `;
  for (const ek of EKLER) s = s.replace(new RegExp(`\\s${kacir(ek)}(?=[\\s,])`, 'g'), ' ');
  for (const k of KALIPLAR) s = s.replace(new RegExp(`\\s${kacir(k)}(?=[\\s,])`, 'g'), ' ');
  const temizle = (x) => x.replace(/\s{2,}/g, ' ').replace(/[\s,&\-]+$/g, '').replace(/\s(ve|Ve|and|&)$/g, '').trim();
  s = temizle(s);
  if (s.length > 36) s = temizle(s.slice(0, 36).replace(/\s+\S*$/, ''));
  return s.length >= 2 ? s : ad.trim();
}

/**
 * Yahoo'da sembol sınaması: 'yok' (404 ya da boş), 'tip' (hisse değil), 'kisa' (EN_AZ_MUM'dan az geçerli mum),
 * 'tamam'. Ağ hatası 'ag' döner ve sembol ELENMEZ (geçici kesinti listeyi boşaltmasın).
 */
async function yahooSina(kod) {
  for (let deneme = 0; deneme < 3; deneme++) {
    let c;
    try {
      c = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(kod)}.IS?interval=1d&range=1y`, { headers: { 'User-Agent': 'Mozilla/5.0 (HisseRadar evren)' }, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
    } catch {
      await bekle(1000 * (deneme + 1));
      continue;
    }
    if (c.status === 404) return { durum: 'yok', mum: 0 };
    if (c.status === 429 || c.status >= 500) { await bekle(1500 * (deneme + 1)); continue; }
    if (!c.ok) return { durum: 'ag', mum: 0 };
    const r = (await c.json().catch(() => null))?.chart?.result?.[0];
    if (!r) return { durum: 'yok', mum: 0 };
    const tip = r.meta?.instrumentType;
    if (tip && tip !== 'EQUITY') return { durum: 'tip', mum: 0, tip };
    const q = r.indicators?.quote?.[0] ?? {};
    const mum = (r.timestamp ?? []).filter((_, i) => [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]].every((v) => typeof v === 'number' && v > 0)).length;
    return { durum: mum < EN_AZ_MUM ? 'kisa' : 'tamam', mum };
  }
  return { durum: 'ag', mum: 0 };
}

/** Listeyi Yahoo'ya göre süz; 4 eşzamanlı istek (kaynağa nazik). */
async function yahooSuz(liste) {
  const elenen = [];
  const kalan = [];
  let sira = 0;
  const isci = async () => {
    while (sira < liste.length) {
      const h = liste[sira++];
      if (SERTIFIKA.has(h.kod)) { elenen.push(`${h.kod} (sertifika)`); continue; }
      const s = await yahooSina(h.kod);
      if (s.durum === 'yok') elenen.push(`${h.kod} (Yahoo'da yok)`);
      else if (s.durum === 'tip') elenen.push(`${h.kod} (tür ${s.tip})`);
      else if (s.durum === 'kisa') elenen.push(`${h.kod} (${s.mum} mum)`);
      else {
        if (s.durum === 'ag') console.warn(`${h.kod}: Yahoo sınanamadı, listede bırakıldı.`);
        kalan.push(h);
      }
      await bekle(150);
    }
  };
  await Promise.all(Array.from({ length: 4 }, isci));
  // İşçiler sırayı karıştırır: ciro sırası korunsun.
  const sirala = new Map(liste.map((h, i) => [h.kod, i]));
  kalan.sort((a, b) => sirala.get(a.kod) - sirala.get(b.kod));
  return { kalan, elenen };
}

function tsDizi(ad, liste) {
  const satirlar = liste.map((h) => `  { kod: '${h.kod}', ad: ${JSON.stringify(h.ad)}, sektor: ${JSON.stringify(h.sektor)} },`);
  return `export const ${ad}: Hisse[] = [\n${satirlar.join('\n')}\n];`;
}

async function main() {
  const [tr, us, wiki] = await Promise.all([
    tvTara('turkey', {
      filter: [{ left: 'type', operation: 'equal', right: 'stock' }, { left: 'subtype', operation: 'in_range', right: ['common', 'foreign-issuer'] }, { left: 'exchange', operation: 'equal', right: 'BIST' }],
      columns: ['name', 'description', 'sector', 'market_cap_basic', 'average_volume_30d_calc', 'close'],
      sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
      range: [0, 1500],
    }),
    tvTara('america', { symbols: { tickers: ABD_SABIT }, columns: ['name', 'description', 'sector'] }),
    vikipediAdlari(),
  ]);

  const bilinmeyenSektor = new Set();
  const sektor = (s) => { if (!s) return 'Diğer'; if (!SEKTOR_TR[s]) bilinmeyenSektor.add(s); return SEKTOR_TR[s] ?? 'Diğer'; };

  const bist = [];
  for (const r of tr) {
    const [kod, tvAd, sek, deger, hacim, kapanis] = r.d;
    if (!/^[A-Z]{3,6}$/.test(kod)) continue;
    const ciro = (hacim ?? 0) * (kapanis ?? 0);
    if (ciro < CIRO_ESIK && (deger ?? 0) < DEGER_ESIK) continue;
    bist.push({ kod, ad: wiki.get(kod) ?? sadelestir(tvAd ?? kod), sektor: sektor(sek), ciro });
  }
  bist.sort((a, b) => b.ciro - a.ciro);
  const { kalan: bistSuzulmus, elenen } = await yahooSuz(bist);
  if (elenen.length) console.log(`Yahoo süzgecinde elenen ${elenen.length}: ${elenen.join(', ')}`);
  if (bistSuzulmus.length < bist.length * 0.8) throw new Error(`Yahoo süzgeci listenin yüzde 20'sinden fazlasını eledi (${elenen.length}/${bist.length}); Yahoo kesintisi olabilir, dosya yazılmadı.`);
  bist.length = 0;
  bist.push(...bistSuzulmus);

  const usHarita = new Map(us.map((r) => [r.d[0], r.d]));
  const abd = [];
  for (const tam of ABD_SABIT) {
    const tvKod = tam.split(':')[1];
    const kod = tvKod.replace('.', '-'); // Yahoo biçimi: BRK-B
    const d = usHarita.get(tvKod);
    if (d) {
      abd.push({ kod, ad: sadelestir(d[1] ?? kod), sektor: sektor(d[2]) });
      continue;
    }
    // TradingView tarayıcısı bazen tek tük sembolü döndürmez (WMT, 2026-10): Yahoo aramasından ad ve sektör.
    const y = await yahooAd(kod);
    if (!y) {
      // Kod değişmiş ya da borsadan çıkmış olabilir (MMC→MRSH, FI→FISV, 2025): listeyi elle düzelt.
      console.warn(`${kod}: hiçbir kaynakta yok, ATLANDI. Yeni kodu bul ve ABD_SABIT'i güncelle.`);
      continue;
    }
    console.warn(`${kod}: TradingView'de yok, Yahoo'dan alındı (${y.ad}).`);
    abd.push({ kod, ad: y.ad, sektor: y.sektor });
  }

  const tekrar = bist.map((h) => h.kod).filter((k, i, a) => a.indexOf(k) !== i);
  if (tekrar.length) throw new Error(`BIST listesinde tekrar: ${tekrar.join(', ')}`);
  if (bilinmeyenSektor.size) console.warn('Sözlükte olmayan sektör (Diğer yazıldı):', [...bilinmeyenSektor].join(', '));

  console.log(`BIST ${bist.length} hisse (ciro ≥ ${CIRO_ESIK / 1e6} M₺ ya da değer ≥ ${DEGER_ESIK / 1e9} Mr₺), ABD ${abd.length}.`);
  console.log(`Vikipedi adı olmayan BIST: ${bist.filter((h) => !wiki.has(h.kod)).map((h) => h.kod).join(', ') || 'yok'}`);
  if (KURU) return;

  const tarih = new Date().toISOString().slice(0, 10);
  const icerik = `/**
 * TARANAN EVREN — ÜRETİLMİŞ DOSYA, elle düzenleme; \`node tarama/arac/evren-guncelle.mjs\` yeniden yazar.
 * Son üretim: ${tarih}. Kural: BIST'te günlük ortalama ciro ≥ ${CIRO_ESIK / 1e6} milyon ₺ ya da piyasa
 * değeri ≥ ${DEGER_ESIK / 1e9} milyar ₺ (ciroya göre sıralı; SINIR ile deneme en likitleri alır). ABD sabit liste.
 * Ad ve sektör uygulamada kodun yanında gösterilir; grafik.json'a yazılır.
 */
export interface Hisse {
  kod: string;
  /** Kısa Türkçe ad; ABD için şirket adı. */
  ad: string;
  /** Türkçe sektör adı (20 başlık). */
  sektor: string;
}

${tsDizi('BIST_HISSELER', bist.map(({ kod, ad, sektor }) => ({ kod, ad, sektor })))}

${tsDizi('ABD_HISSELER', abd)}

export const BIST: string[] = BIST_HISSELER.map((h) => h.kod);
export const ABD: string[] = ABD_HISSELER.map((h) => h.kod);

/** "BIST:THYAO" → ad ve sektör. */
export const HISSE_BILGI: Record<string, Hisse> = Object.fromEntries([
  ...BIST_HISSELER.map((h) => [\`BIST:\${h.kod}\`, h] as const),
  ...ABD_HISSELER.map((h) => [\`ABD:\${h.kod}\`, h] as const),
]);

export const ENDEKSLER = { XU100: 'XU100.IS', SPX: '^GSPC' } as const;

export function yahooSembol(sembol: string, piyasa: 'BIST' | 'ABD'): string {
  return piyasa === 'BIST' ? \`\${sembol}.IS\` : sembol;
}
`;
  writeFileSync(HEDEF, icerik);
  console.log(`Yazıldı: ${HEDEF}`);
}

main().catch((e) => {
  console.error('evren güncellenemedi:', e.message);
  process.exit(1);
});
