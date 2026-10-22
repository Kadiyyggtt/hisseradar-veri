/**
 * BİLDİRİM METNİ — saf; sınanabilir. Konu adı uygulamadaki ders adıdır
 * (uygulama deposu src/icerik/dersler → taramaId → ad). Yeni tarayıcı eklenince
 * buraya da ad yazılır; sina.ts eksik adı yakalar.
 */
export const TARAMA_ADLARI: Record<string, string> = {
  '123-dongusu': '1-2-3 Döngüsü', '200-sikismasi': '200 Sıkışması', 'abcd-esnek': 'Esnek ABCD', 'abcd-klasik': 'Klasik ABCD',
  'altin-kesisme': 'Altın Kesişme', 'ay-sonu-taramasi': 'Ay Sonu Taraması', 'aylik-5-10': 'Aylık 5 ve 10', bayrak: 'Bayrak ve Flama',
  'bes-dalga': 'Beş Dalga', 'birlesik-123': 'Birleşik 1-2-3', dikdortgen: 'Üçlü Tepe, Üçlü Dip ve Dikdörtgen', dugum: 'Düğüm 5-8-13-21',
  'ema200-donus': '200 Günlük Geri Dönüş', ema200: '200 Günlük', 'endeks-nabzi': 'Endeks Nabzı', 'fib-merdiveni': 'Fibonacci Merdiveni',
  'fincan-kulp': 'Fincan Kulp', 'haftalik-cift-onay': 'Haftalık Çift Onay', heikin: 'Heikin Ashi Teyit Mumu', 'hisse-8-89': 'Hisse 8/89',
  'ikili-tepe-dip': 'İkili Tepe ve İkili Dip', 'k-52-hafta': '52 Haftalık Zirve Kırılımı', 'k-dar-bayrak': 'Yüksek ve Dar Bayrak',
  kama: 'Kama ve Takoz', 'kuyruklu-w': 'Kuyruklu W', 'obo-tobo': 'OBO ve TOBO', qm: 'QM', 'rsi-uyumsuzluk': 'RSI Uyumsuzluğu',
  'saatlik-9-26': 'Saatlik 9/26', 'sahte-cikis': 'Sahte Çıkış', sma30w: '30 Haftalık', 'topuk-donusu': 'Topuk Dönüşü',
  'uc-bant-testi': 'Üç Bant Testi', ucgenler: 'Üçgenler', wolfe: 'Wolfe Dalgaları', 'yeni-dongu': 'Sahte Çıkış Yapmayan Yapı',
  'yukselen-dipler': 'Alçalan Tepeler, Yükselen Dipler',
};

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
