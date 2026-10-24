/**
 * TARAMA TİPLERİ — GitHub Actions'ta koşan tarayıcı ile uygulamanın
 * paylaştığı veri şekli. Uygulama yalnız `TaramaSonucu` JSON'unu okur.
 */

export interface Mum {
  /** Unix saniye, UTC. */
  t: number;
  a: number; // açılış
  y: number; // yüksek
  d: number; // düşük
  k: number; // kapanış
  h: number; // hacim
}

export type Periyot = '1h' | '4h' | '1d' | '1w' | '1mo';

/** Bir sembolün bütün periyotlardaki mumları. */
export interface Seriler {
  sembol: string;
  piyasa: 'BIST' | 'ABD';
  ad?: string;
  '1h': Mum[];
  '4h': Mum[];
  '1d': Mum[];
  '1w': Mum[];
  '1mo': Mum[];
}

export type Yon = 'al' | 'sat' | 'izle';

/**
 * GRAFİK ÜSTÜ ÇİZİM — formasyonun noktaları ve çizgileri, uygulamanın 60 günlük
 * mum grafiğine oturtulur. `g` = son mumdan kaç mum geri (0 = son mum); grafik.json
 * aynı koşuda üretildiği için indeks birebir tutar. Yalnız günlük eşleşmelerde.
 */
export interface CizimNokta {
  g: number;
  fiyat: number;
  /** Kısa etiket: X, A, B, C, D, 1-5, SO, B, SA, Boyun… */
  ad: string;
}
export interface CizimCizgi {
  a: CizimNokta;
  b: CizimNokta;
  /** 'boyun' düz, 'trend' kesikli, 'bacak' noktaları birleştiren ince çizgi. */
  tur: 'boyun' | 'trend' | 'bacak';
}
export interface EslesmeCizimi {
  noktalar?: CizimNokta[];
  cizgiler?: CizimCizgi[];
}

export interface Eslesme {
  sembol: string;
  piyasa: 'BIST' | 'ABD';
  taramaId: string;
  yon: Yon;
  /** 0-100. A sınıfı taramalarda 100; B sınıfında güven yüzdesi. */
  guven: number;
  periyot: Periyot;
  /** "Şu kurala şu yüzden uyuyor" satırları, kartta aynen gösterilir. */
  aciklama: string[];
  /** Kartta çizilecek yatay seviyeler: ad → fiyat. */
  seviyeler?: Record<string, number>;
  /** Eşleşmenin oluştuğu son mumun zamanı. */
  t: number;
  /** Son kapanış. */
  fiyat: number;
  /** Grafik üstü çizim (noktalar, çizgiler); yoksa yalnız seviyeler çizilir. */
  cizim?: EslesmeCizimi;
}

export interface Ortam {
  /** Endeks Nabzı 8/20: endeks 4 saatlikte EMA8 > EMA20 mi. */
  endeksNabzi: Record<'XU100' | 'SPX', { pozitif: boolean; ema8: number; ema20: number; t: number } | null>;
}

/** Hayali portföy: dönem başında 100 bazlı, üç hisse (2 BIST + 1 ABD). */
export interface PortfoyPozisyon {
  sembol: string;
  piyasa: 'BIST' | 'ABD';
  taramaId: string;
  giris: number;
  girisT: number;
  simdi: number;
  /** Oran: 0,05 = yüzde 5. */
  getiri: number;
}

export interface PortfoyDonem {
  tur: 'hafta' | 'ay' | 'yil';
  /** '2026-H42', '2026-10', '2026' */
  anahtar: string;
  baslangic: number;
  pozisyonlar: PortfoyPozisyon[];
  /** 100 bazlı değer: üç pozisyonun eşit ağırlıklı ortalaması. */
  deger: number;
}

export interface PortfoyKapanan extends PortfoyDonem {
  bitis: number;
}

export interface Portfoy {
  hafta: PortfoyDonem | null;
  ay: PortfoyDonem | null;
  yil: PortfoyDonem | null;
  /** Kapanan dönemler, en yeni başta; en çok 60 kayıt. */
  gecmis: PortfoyKapanan[];
}

/** Son mumdaki gösterge değerleri; tarayıcı tam (3 yıllık) seriden hesaplar, telefonda hesap yapılmaz. */
export interface Gosterge {
  /** RSI 14, 0-100. */
  rsi: number;
  /** MACD (12, 26) ve 9'luk sinyal çizgisi, fiyat biriminde. */
  macd: number;
  sinyal: number;
  ema20: number;
  ema50: number;
}

/**
 * Grafik verisi: sembol başına son 60 günlük mumlar. `k` ve `h` her zaman var
 * (eski uygulama yalnız bunları okur); açılış/yüksek/düşük, ad, sektör ve
 * göstergeler sonradan eklendi, hepsi isteğe bağlı.
 */
export interface GrafikSerisi {
  /** İlk mumun unix saniyesi; sonrakiler iş günü sırasıyla. */
  t0: number;
  /** Son mumun unix saniyesi. */
  t1: number;
  k: number[];
  h: number[];
  a?: number[];
  y?: number[];
  d?: number[];
  /** Kısa Türkçe şirket adı ve sektör (veri/evren.ts). */
  ad?: string;
  sektor?: string;
  g?: Gosterge;
}
export type GrafikVerisi = { surum: 1; uretildi: number; seriler: Record<string, GrafikSerisi> };

export interface TaramaSonucu {
  surum: 1;
  uretildi: number; // unix saniye
  ortam: Ortam;
  eslesmeler: Eslesme[];
  /** taramaId → eşleşme sayısı. */
  sayac: Record<string, number>;
  taranan: { BIST: number; ABD: number; hatali: string[] };
  portfoy?: Portfoy;
}

export interface Tarayici {
  id: string;
  /** Hangi piyasa ortamında çalışsın; boşsa her zaman. */
  sart?: (ortam: Ortam, piyasa: 'BIST' | 'ABD') => boolean;
  tara: (s: Seriler, ortam: Ortam) => Eslesme | null;
}

/** Formasyon karnesi: ilk görüldüğü fiyat ve ilk yukarı hedef; sonradan hedefe değdi mi. */
export interface SicilKayit {
  sembol: string;
  piyasa: 'BIST' | 'ABD';
  taramaId: string;
  giris: number;
  hedef: number;
  /** İlk görülme zamanı (Unix saniye). */
  t: number;
  sonuc?: 'ulasti' | 'ulasmadi';
  bitis?: number;
}

export interface Sicil {
  surum: 1;
  uretildi: number;
  sureGun: number;
  /** Bir formasyonun oranı gösterilmeden önce gereken en az kapanmış kayıt sayısı. */
  enAz: number;
  acik: SicilKayit[];
  kapali: SicilKayit[];
  /** taramaId → kapanmış kayıt sayısı ve hedefe ulaşan sayısı. */
  ozet: Record<string, { n: number; ulasan: number }>;
}

/** Hedefe ulaşan kayıt: sicilde bu koşuda "ulaştı" diye kapanan kayıt + o anki fiyat. Takip bildirimi bundan gider. */
export interface HedefUlasan extends SicilKayit {
  fiyat: number;
}

export interface HedefDosyasi {
  uretildi: number;
  ulasanlar: HedefUlasan[];
}

/**
 * KARŞILAŞTIRMA GEÇMİŞİ — gün başına bir satır: endeks kapanışları ve hayali
 * portföyün dönem değerleri. Uygulama bununla "senin sanal cüzdanın, hayali
 * portföy, BIST 100" üç çizgisini aynı eksende çizer. En çok 400 gün.
 */
export interface GecmisGun {
  /** Günün unix saniyesi (İstanbul gününün 00:00'ı). */
  t: number;
  xu100: number | null;
  spx: number | null;
  /** Hayali portföyün 100 bazlı değerleri; dönem yoksa null. */
  hayali: { hafta: number | null; ay: number | null; yil: number | null };
}
export interface GecmisDosyasi {
  surum: 1;
  uretildi: number;
  gunler: GecmisGun[];
}
