/**
 * BİLDİRİM METNİ — saf; sınanabilir. Konu adı uygulamadaki ders adıdır
 * (uygulama deposu src/icerik/dersler → taramaId → ad). Yeni tarayıcı eklenince
 * buraya da ad yazılır; sina.ts eksik adı yakalar.
 */
export const TARAMA_ADLARI: Record<string, string> = {
  '123-dongusu': '1-2-3 Döngüsü', '200-sikismasi': '200 Sıkışması', 'abcd-esnek': 'Esnek ABCD', 'abcd-klasik': 'Klasik ABCD',
  'altin-kesisme': 'Altın Kesişme', 'ay-sonu-taramasi': 'Ay Sonu Taraması', 'aylik-5-10': 'Aylık 5 ve 10', bayrak: 'Bayrak ve Flama',
  'bes-dalga': 'Beş Dalga', 'birlesik-123': 'Birleşik 1-2-3', dikdortgen: 'Dikdörtgen: Üç Temas Kutuyu Kurar', dugum: 'Düğüm 5-8-13-21',
  'ema200-donus': '200 Günlük Geri Dönüş', ema200: '200 Günlük', 'endeks-nabzi': 'Endeks Nabzı', 'fib-merdiveni': 'Fibonacci Merdiveni',
  'fincan-kulp': 'Fincan Kulp', 'haftalik-cift-onay': 'Haftalık Çift Onay', heikin: 'Heikin Ashi Teyit Mumu', 'hisse-8-89': 'Hisse 8/89',
  'ikili-tepe-dip': 'İkili Tepe ve İkili Dip', 'k-52-hafta': '52 Haftalık Zirve Kırılımı', 'k-dar-bayrak': 'Yüksek ve Dar Bayrak',
  kama: 'Kama ve Takoz', 'kuyruklu-w': 'Kuyruklu W', 'obo-tobo': 'OBO ve TOBO', qm: 'QM', 'rsi-uyumsuzluk': 'RSI Uyumsuzluğu',
  'saatlik-9-26': 'Saatlik 9/26', 'sahte-cikis': 'Sahte Çıkış', sma30w: '30 Haftalık', 'topuk-donusu': 'Topuk Dönüşü',
  'uc-bant-testi': 'Üç Bant Testi', ucgenler: 'Üçgenler', wolfe: 'Wolfe Dalgaları', 'yeni-dongu': 'Sahte Çıkış Yapmayan Yapı',
  'yukselen-dipler': 'Alçalan Tepeler, Yükselen Dipler',
  gartley: 'Gartley', bat: 'Bat', butterfly: 'Butterfly', 'ters-fincan-kulp': 'Ters Fincan Kulp', 'uclu-tepe-dip': 'Üçlü Tepe ve Üçlü Dip',
  yutan: 'Yutan Mum', cekic: 'Çekiç ve Kayan Yıldız', 'sabah-yildizi': 'Sabah ve Akşam Yıldızı',
};

import type { HedefUlasan } from './tipler';

export interface BildirimMetni {
  baslik: string;
  govde: string;
}

/**
 * Kadir'in istediği cümle: "X hissesi Y stratejisine uydu." Birden çoksa sayı ve
 * ilk beş sembol. Yükseliş şartı öncelikli; yalnız düşüş varsa o yazılır.
 */
export function bildirimMetni(konu: string, liste: { sembol: string; yon: 'al' | 'sat' | 'izle' }[]): BildirimMetni | null {
  const ad = TARAMA_ADLARI[konu] ?? konu;
  const al = liste.filter((e) => e.yon === 'al');
  const sat = liste.filter((e) => e.yon === 'sat');
  const ana = al.length ? al : sat;
  if (!ana.length) return null;
  const sart = al.length ? 'Yükseliş şartı sağlandı.' : 'Düşüş şartı sağlandı.';
  const ek = al.length && sat.length ? ` Ayrıca ${sat.length} hissede düşüş şartı var.` : '';
  if (ana.length === 1) {
    return { baslik: `${ana[0].sembol} · ${ad}`, govde: `${ana[0].sembol} hissesi ${ad} stratejisine uydu. ${sart}${ek}` };
  }
  const semboller = ana.slice(0, 5).map((e) => e.sembol).join(', ') + (ana.length > 5 ? ` ve ${ana.length - 5} hisse daha` : '');
  return { baslik: `${ana.length} hisse · ${ad}`, govde: `${ana.length} hisse ${ad} stratejisine uydu: ${semboller}. ${sart}${ek}` };
}

const fiyatYaz = (n: number, piyasa: 'BIST' | 'ABD') => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${piyasa === 'BIST' ? '₺' : '$'}`;

/** Takipteki hissenin bildirim konusu: Firebase konu adı deseni [a-zA-Z0-9-_.~%]+ (BRK-B uyar). */
export function hedefKonusu(piyasa: 'BIST' | 'ABD', sembol: string): string {
  return `hedef-${piyasa}-${sembol}`;
}

/**
 * "THYAO 312,50 ₺ ile Topuk Dönüşü hedefine (310,00 ₺) ulaştı." Aynı hissenin
 * birden çok formasyonu aynı koşuda hedefe değerse tek bildirim, formasyon adları
 * virgülle. Getiri, en eski kaydın giriş fiyatından.
 */
export function hedefBildirimMetni(liste: HedefUlasan[]): BildirimMetni | null {
  if (!liste.length) return null;
  const { sembol, piyasa, fiyat } = liste[0];
  const adlar = [...new Set(liste.map((k) => TARAMA_ADLARI[k.taramaId] ?? k.taramaId))];
  const enEski = liste.reduce((a, b) => (b.t < a.t ? b : a));
  const getiri = enEski.giris > 0 ? fiyat / enEski.giris - 1 : 0;
  const yuzde = `${getiri >= 0 ? '+' : ''}%${(getiri * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  const govde = adlar.length === 1
    ? `${sembol} ${fiyatYaz(fiyat, piyasa)} ile ${adlar[0]} hedefine (${fiyatYaz(enEski.hedef, piyasa)}) ulaştı. Formasyon görüldüğünden bu yana ${yuzde}.`
    : `${sembol} ${fiyatYaz(fiyat, piyasa)} ile ${adlar.length} formasyonun hedefine ulaştı: ${adlar.join(', ')}. Formasyon görüldüğünden bu yana ${yuzde}.`;
  return { baslik: `${sembol} · Hedef 1'e ulaştı`, govde };
}
