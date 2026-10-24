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

import type { Eslesme, HedefUlasan, Sicil, TaramaSonucu } from './tipler';

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

/** Konu adları: uygulamadaki Ayarlar anahtarları bu konulara abone olur. */
export const BRIFING_KONUSU = 'brifing';
export const HAFTALIK_KONUSU = 'haftalik';

const sayac = (n: number, tekil: string) => `${n} ${tekil}`;

/**
 * SABAH BRİFİNGİ (hafta içi 09:45): son taramada YENİ yükseliş şartları (yeni.json) ve
 * birden çok formasyondan geçen güçlü adaylar. Bütün eşleşmeleri saymak anlamsız:
 * 24 Ekim'de 316 hissede "al" vardı; yeni olan ve güçlü olan haber değeri taşır.
 */
export function sabahBrifingi(sonuc: TaramaSonucu, yeni: Eslesme[], simdi = Date.now()): BildirimMetni {
  const yeniAl = yeni.filter((e) => e.yon === 'al');
  const yeniSemboller = [...new Set(yeniAl.map((e) => e.sembol))];
  const yeniSat = new Set(yeni.filter((e) => e.yon === 'sat').map((e) => e.sembol)).size;
  // Güçlü aday: aynı hissede en az 3 farklı formasyonda yükseliş şartı, hiçbirinde düşüş şartı yok.
  const hisse = new Map<string, { al: Set<string>; sat: boolean }>();
  for (const e of sonuc.eslesmeler) {
    const k = `${e.piyasa}:${e.sembol}`;
    const h = hisse.get(k) ?? { al: new Set<string>(), sat: false };
    if (e.yon === 'al') h.al.add(e.taramaId);
    if (e.yon === 'sat') h.sat = true;
    hisse.set(k, h);
  }
  const guclu = [...hisse.entries()].filter(([, h]) => h.al.size >= 3 && !h.sat).sort((a, b) => b[1].al.size - a[1].al.size).map(([k]) => k.split(':')[1]);
  const formasyon = new Map<string, number>();
  for (const e of yeniAl) formasyon.set(e.taramaId, (formasyon.get(e.taramaId) ?? 0) + 1);
  const enCok = [...formasyon.entries()].sort((a, b) => b[1] - a[1])[0];
  const nabiz = (ad: 'XU100' | 'SPX') => { const n = sonuc.ortam.endeksNabzi[ad]; return n ? (n.pozitif ? 'olumlu' : 'olumsuz') : 'veri yok'; };
  const gun = new Date(simdi).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });
  const liste = (l: string[]) => l.slice(0, 4).join(', ') + (l.length > 4 ? ` ve ${l.length - 4} hisse daha` : '');
  const parcalar: string[] = [];
  if (yeniSemboller.length) parcalar.push(`${sayac(yeniSemboller.length, 'hissede')} yeni yükseliş şartı: ${liste(yeniSemboller)}.`);
  else parcalar.push('Son taramada yeni yükseliş şartı oluşmadı.');
  if (yeniSat) parcalar.push(`${sayac(yeniSat, 'hissede')} yeni düşüş şartı.`);
  if (guclu.length) parcalar.push(`Güçlü aday ${guclu.length}: ${liste(guclu)}.`);
  if (enCok) parcalar.push(`En çok görülen formasyon ${TARAMA_ADLARI[enCok[0]] ?? enCok[0]}.`);
  parcalar.push(`Endeks nabzı BIST ${nabiz('XU100')}, ABD ${nabiz('SPX')}.`);
  if (!yeniSemboller.length && !guclu.length) parcalar.push('Sabırlı olmanın günü.');
  return { baslik: `Sabah brifingi · ${gun}`, govde: parcalar.join(' ') };
}

/**
 * HAFTALIK ÖZET (pazar 18:00): son 7 günde kapanan karne kayıtları, hedefe ulaşma oranı,
 * en isabetli formasyon, hayali portföyün hafta değeri.
 */
export function haftalikOzet(sonuc: TaramaSonucu, sicil: Sicil | null, simdi = Date.now()): BildirimMetni {
  const haftaOnce = Math.floor(simdi / 1000) - 7 * 86400;
  const kapanan = (sicil?.kapali ?? []).filter((k) => (k.bitis ?? 0) >= haftaOnce);
  const ulasan = kapanan.filter((k) => k.sonuc === 'ulasti').length;
  const basari = new Map<string, { n: number; u: number }>();
  for (const k of kapanan) { const o = basari.get(k.taramaId) ?? { n: 0, u: 0 }; o.n++; if (k.sonuc === 'ulasti') o.u++; basari.set(k.taramaId, o); }
  const enIyi = [...basari.entries()].filter(([, o]) => o.n >= 3).sort((a, b) => b[1].u / b[1].n - a[1].u / a[1].n)[0];
  const parcalar: string[] = [];
  if (kapanan.length) parcalar.push(`Bu hafta ${sayac(kapanan.length, 'formasyon')} sonuçlandı: ${ulasan} hedefe ulaştı, ${kapanan.length - ulasan} süresi doldu (yüzde ${Math.round((ulasan * 100) / kapanan.length)} isabet).`);
  else parcalar.push('Bu hafta sonuçlanan formasyon kaydı yok.');
  // Karne 30 günden gençse süresi dolan kayıt henüz yoktur; yüzde yanıltmasın.
  if (sicil && kapanan.length && !kapanan.some((k) => k.sonuc === 'ulasmadi') && sicil.acik.length > kapanan.length) parcalar.push('Karne yeni; süresi dolan kayıt henüz yok, oran zamanla oturacak.');
  if (enIyi) parcalar.push(`En isabetli formasyon ${TARAMA_ADLARI[enIyi[0]] ?? enIyi[0]}: ${enIyi[1].n} kayıttan ${enIyi[1].u} hedef.`);
  const hafta = sonuc.portfoy?.hafta;
  if (hafta) parcalar.push(`Hayali portföy haftayı ${hafta.deger >= 100 ? '+' : ''}${(hafta.deger - 100).toFixed(1).replace('.', ',')} ile ${hafta.deger >= 100 ? 'artıda' : 'ekside'} kapattı (${hafta.pozisyonlar.map((p) => p.sembol).join(', ')}).`);
  parcalar.push(`Açık karne kaydı ${sicil?.acik.length ?? 0}. Pazartesi için ${new Set(sonuc.eslesmeler.filter((e) => e.yon === 'al').map((e) => e.sembol)).size} hissede yükseliş şartı duruyor.`);
  return { baslik: 'Haftalık özet', govde: parcalar.join(' ') };
}
