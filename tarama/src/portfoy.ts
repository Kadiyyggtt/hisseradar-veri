import type { Eslesme, Portfoy, PortfoyDonem, PortfoyKapanan, PortfoyPozisyon } from './tipler';

/**
 * HAYALİ PORTFÖY — uygulamanın "inandırma" vitrini.
 *
 * Her dönemin (hafta, ay, yıl) İLK taramasında o anki en güçlü "al şartı
 * sağlandı" eşleşmelerinden üç hisse seçilir: iki BIST, bir ABD. Giriş
 * fiyatı o taramadaki kapanıştır. Sonraki her taramada güncel kapanışla
 * değer yenilenir; dönem bitince kayıt geçmişe düşer ve yeni üçlü seçilir.
 * Değer 100 bazlıdır: üç pozisyonun eşit ağırlıklı ortalaması.
 *
 * Seçim ÖNCE formasyon tarayıcılarına (Topuk Dönüşü, Fibonacci Merdiveni,
 * Kuyruklu W, QM, Wolfe, TOBO, fincan-kulp...) bakar; onlar yoksa güvene
 * göre sıralı diğer al eşleşmelerine düşer. Hiç al yoksa izle. Bu sıra
 * sabit ve tekrarlanabilir: aynı girdiyle aynı seçim çıkar.
 */
const ONCELIK = [
  'topuk-donusu', 'fib-merdiveni', 'kuyruklu-w', 'qm', 'wolfe', 'obo-tobo', 'ikili-tepe-dip', 'fincan-kulp',
  'ucgenler', 'kama', 'dikdortgen', 'bayrak', 'k-dar-bayrak', 'k-52-hafta', 'yeni-dongu', 'sahte-cikis', '200-sikismasi',
  'abcd-esnek', 'abcd-klasik', 'sma30w', 'altin-kesisme', 'ema200-donus', 'haftalik-cift-onay', 'hisse-8-89', 'saatlik-9-26',
  'ema200', 'heikin', 'rsi-uyumsuzluk',
];

const oncelik = (id: string) => {
  const i = ONCELIK.indexOf(id);
  return i < 0 ? 999 : i;
};

/** Türkiye saatiyle (UTC+3) tarih parçaları. BIST günü bu saate göre döner. */
function trTarih(unix: number): { yil: number; ay: number; gun: number; haftaGunu: number } {
  const d = new Date((unix + 3 * 3600) * 1000);
  return { yil: d.getUTCFullYear(), ay: d.getUTCMonth() + 1, gun: d.getUTCDate(), haftaGunu: (d.getUTCDay() + 6) % 7 };
}

/** ISO hafta numarası (Pazartesi başlangıç). */
function isoHafta(unix: number): { yil: number; hafta: number } {
  const d = new Date((unix + 3 * 3600) * 1000);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const gun = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - gun);
  const yilBasi = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { yil: t.getUTCFullYear(), hafta: Math.ceil(((t.getTime() - yilBasi.getTime()) / 86400000 + 1) / 7) };
}

export function donemAnahtari(tur: PortfoyDonem['tur'], unix: number): string {
  const t = trTarih(unix);
  if (tur === 'yil') return String(t.yil);
  if (tur === 'ay') return `${t.yil}-${String(t.ay).padStart(2, '0')}`;
  const h = isoHafta(unix);
  return `${h.yil}-H${String(h.hafta).padStart(2, '0')}`;
}

/** Üç hisse seç: 2 BIST + 1 ABD. Tekrarlanabilir sıralama. */
export function ucluSec(eslesmeler: Eslesme[], simdi: number): PortfoyPozisyon[] {
  const sirala = (liste: Eslesme[]) =>
    [...liste].sort((a, b) => oncelik(a.taramaId) - oncelik(b.taramaId) || b.guven - a.guven || a.sembol.localeCompare(b.sembol));
  const sec = (piyasa: 'BIST' | 'ABD', adet: number): PortfoyPozisyon[] => {
    const al = sirala(eslesmeler.filter((e) => e.piyasa === piyasa && e.yon === 'al'));
    const izle = sirala(eslesmeler.filter((e) => e.piyasa === piyasa && e.yon === 'izle'));
    const out: PortfoyPozisyon[] = [];
    const gorulen = new Set<string>();
    for (const e of [...al, ...izle]) {
      if (out.length >= adet) break;
      if (gorulen.has(e.sembol)) continue;
      gorulen.add(e.sembol);
      out.push({ sembol: e.sembol, piyasa, taramaId: e.taramaId, giris: e.fiyat, girisT: simdi, simdi: e.fiyat, getiri: 0 });
    }
    return out;
  };
  return [...sec('BIST', 2), ...sec('ABD', 1)];
}

function degerle(d: PortfoyDonem, fiyatlar: Map<string, number>): PortfoyDonem {
  const pozisyonlar = d.pozisyonlar.map((p) => {
    const f = fiyatlar.get(`${p.piyasa}:${p.sembol}`) ?? p.simdi;
    return { ...p, simdi: f, getiri: f / p.giris - 1 };
  });
  const deger = pozisyonlar.length ? (100 * pozisyonlar.reduce((s, p) => s + p.simdi / p.giris, 0)) / pozisyonlar.length : 100;
  return { ...d, pozisyonlar, deger: Math.round(deger * 100) / 100 };
}

/**
 * Bir tarama sonrası portföyü ilerlet. `onceki` yoksa üç dönem de bugün
 * başlar. Dönem anahtarı değiştiyse eski dönem güncel fiyatla kapanır.
 */
export function portfoyuIlerlet(onceki: Portfoy | null, eslesmeler: Eslesme[], fiyatlar: Map<string, number>, simdi: number): Portfoy {
  const sonuc: Portfoy = { hafta: null, ay: null, yil: null, gecmis: [...(onceki?.gecmis ?? [])] };
  for (const tur of ['hafta', 'ay', 'yil'] as const) {
    const anahtar = donemAnahtari(tur, simdi);
    const eski = onceki?.[tur] ?? null;
    if (eski && eski.anahtar === anahtar) {
      sonuc[tur] = degerle(eski, fiyatlar);
      continue;
    }
    if (eski) {
      const kapanan: PortfoyKapanan = { ...degerle(eski, fiyatlar), bitis: simdi };
      sonuc.gecmis.unshift(kapanan);
    }
    const pozisyonlar = ucluSec(eslesmeler, simdi);
    sonuc[tur] = { tur, anahtar, baslangic: simdi, pozisyonlar, deger: 100 };
  }
  sonuc.gecmis = sonuc.gecmis.slice(0, 60);
  return sonuc;
}
