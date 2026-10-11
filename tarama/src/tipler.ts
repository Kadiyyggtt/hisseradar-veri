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
