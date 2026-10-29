/**
 * BİLDİRİM METNİ — saf; sınanabilir. Konu adı uygulamadaki ders adıdır
 * (uygulama deposu src/icerik/dersler → taramaId → ad). Yeni tarayıcı eklenince
 * buraya da ad yazılır; sina.ts eksik adı yakalar.
 */
export const TARAMA_ADLARI: Record<string, string> = {
  '123-dongusu': '1-2-3 Döngüsü', '200-sikismasi': '200 Sıkışması', 'abcd-esnek': 'Esnek ABCD', 'abcd-klasik': 'Klasik ABCD',
  'altin-kesisme': 'Altın Kesişme', 'ay-sonu-taramasi': 'Ay Sonu Taraması', 'aylik-5-10': 'Aylık 5 ve 10', bayrak: 'Bayrak ve Flama',
  'bes-dalga': 'Beş Dalga', dikdortgen: 'Dikdörtgen: Üç Temas Kutuyu Kurar', dugum: 'Düğüm 5-8-13-21',
  'ema200-donus': '200 Günlük Geri Dönüş', ema200: '200 Günlük', 'fib-merdiveni': 'Fibonacci Merdiveni',
  'fincan-kulp': 'Fincan Kulp', 'haftalik-cift-onay': 'Haftalık Çift Onay', heikin: 'Heikin Ashi Teyit Mumu', 'hisse-8-89': 'Hisse 8/89',
  'ikili-tepe-dip': 'İkili Tepe ve İkili Dip', 'k-52-hafta': '52 Haftalık Zirve Kırılımı', 'k-dar-bayrak': 'Yüksek ve Dar Bayrak',
  kama: 'Kama ve Takoz', 'kuyruklu-w': 'Kuyruklu W', 'obo-tobo': 'OBO ve TOBO', qm: 'QM', 'rsi-uyumsuzluk': 'RSI Uyumsuzluğu',
  'saatlik-9-26': 'Saatlik 9/26', 'sahte-cikis': 'Sahte Çıkış', sma30w: '30 Haftalık', 'topuk-donusu': 'Topuk Dönüşü',
  'uc-bant-testi': 'Üç Bant Testi', ucgenler: 'Üçgenler', wolfe: 'Wolfe Dalgaları', 'yeni-dongu': 'Sahte Çıkış Yapmayan Yapı',
  'yukselen-dipler': 'Alçalan Tepeler, Yükselen Dipler',
  gartley: 'Gartley', bat: 'Bat', butterfly: 'Butterfly', 'ters-fincan-kulp': 'Ters Fincan Kulp', 'uclu-tepe-dip': 'Üçlü Tepe ve Üçlü Dip',
  yutan: 'Yutan Mum', cekic: 'Çekiç ve Kayan Yıldız', 'sabah-yildizi': 'Sabah ve Akşam Yıldızı',
};

import { esikAltiKayit } from './sicil';
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
 * SABAH BRİFİNGİ (hafta içi, günün ilk sabah taramasının sonunda): son taramada YENİ yükseliş şartları (yeni.json) ve
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
 * hedefe en sık ulaşan formasyon, hayali portföyün hafta değeri.
 */
export function haftalikOzet(sonuc: TaramaSonucu, sicil: Sicil | null, simdi = Date.now()): BildirimMetni {
  const haftaOnce = Math.floor(simdi / 1000) - 7 * 86400;
  // Eşik öncesinden kalmış kayıt (hedef girişe yüzde 1,5'ten yakın) sayılmaz: 61/61 "isabet" böyle çıkıyordu.
  const kapanan = (sicil?.kapali ?? []).filter((k) => (k.bitis ?? 0) >= haftaOnce && !esikAltiKayit(k));
  const ulasan = kapanan.filter((k) => k.sonuc === 'ulasti').length;
  const basari = new Map<string, { n: number; u: number }>();
  for (const k of kapanan) { const o = basari.get(k.taramaId) ?? { n: 0, u: 0 }; o.n++; if (k.sonuc === 'ulasti') o.u++; basari.set(k.taramaId, o); }
  const enIyi = [...basari.entries()].filter(([, o]) => o.n >= 3).sort((a, b) => b[1].u / b[1].n - a[1].u / a[1].n)[0];
  const parcalar: string[] = [];
  if (kapanan.length) parcalar.push(`Bu hafta ${sayac(kapanan.length, 'formasyon')} sonuçlandı: ${ulasan} hedefe ulaştı, ${kapanan.length - ulasan} süresi doldu (hedefe ulaşma oranı yüzde ${Math.round((ulasan * 100) / kapanan.length)}).`);
  else parcalar.push('Bu hafta sonuçlanan formasyon kaydı yok.');
  // Karne 30 günden gençse süresi dolan kayıt henüz yoktur; yüzde yanıltmasın.
  if (sicil && kapanan.length && !kapanan.some((k) => k.sonuc === 'ulasmadi') && sicil.acik.filter((k) => !esikAltiKayit(k)).length > kapanan.length) parcalar.push('Karne yeni; süresi dolan kayıt henüz yok, oran zamanla oturacak.');
  if (enIyi) parcalar.push(`Geçmiş kayıtlarda hedefe en sık ulaşan formasyon ${TARAMA_ADLARI[enIyi[0]] ?? enIyi[0]}: ${enIyi[1].n} kayıttan ${enIyi[1].u} hedef.`);
  const hafta = sonuc.portfoy?.hafta;
  if (hafta) {
    // "yüzde 6,5 ekside"; yuvarlanınca sıfırsa "yatay" (eski metin "-0,0 ile ekside" yazıyordu).
    const fark = Math.round((hafta.deger - 100) * 10) / 10;
    const durum = fark === 0 ? 'yatay' : `yüzde ${Math.abs(fark).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${fark > 0 ? 'artıda' : 'ekside'}`;
    parcalar.push(`Otomatik portföy haftayı ${durum} kapattı (${hafta.pozisyonlar.map((p) => p.sembol).join(', ')}).`);
  }
  parcalar.push(`Açık karne kaydı ${(sicil?.acik ?? []).filter((k) => !esikAltiKayit(k)).length}. Pazartesi için ${new Set(sonuc.eslesmeler.filter((e) => e.yon === 'al').map((e) => e.sembol)).size} hissede yükseliş şartı duruyor.`);
  return { baslik: 'Haftalık özet', govde: parcalar.join(' ') };
}

const SAAT = 3600;
/** İstanbul takvim günü (UTC+3, yaz saati yok) ve haftanın günü (0 pazar, 6 cumartesi). */
const istGun = (sn: number) => Math.floor((sn + 3 * SAAT) / 86400);
const haftaGunu = (gun: number) => (gun + 4) % 7; // 1 Ocak 1970 perşembe

/**
 * Brifingin dayandığı tarama taze mi: 24 saat, araya giren her hafta sonu günü için 24 saat
 * daha (cuma gece taraması pazartesi sabahı ve pazar akşamı geçerli). Tarama günlerce
 * düşmüşse eski "güçlü aday" listesi yeni gibi gönderilmesin.
 */
export function veriGuncelMi(uretildi: number, simdiSn: number): boolean {
  if (!Number.isFinite(uretildi) || uretildi <= 0) return false;
  const yas = simdiSn - uretildi;
  if (yas < 0) return true;
  let haftaSonu = 0;
  // Başlangıç günü de sayılır: ABD kapanış taraması (21:47 UTC) İstanbul'da cumartesiye düşer.
  for (let g = istGun(uretildi); g <= istGun(simdiSn); g++) if (haftaGunu(g) === 0 || haftaGunu(g) === 6) haftaSonu++;
  return yas <= (24 + 24 * haftaSonu) * SAAT;
}

/** İstanbul'a göre cumartesi ya da pazar mı (piyasa kapalı, tarama verisi değişmez). */
export const haftaSonuMu = (sn: number) => { const g = haftaGunu(istGun(sn)); return g === 0 || g === 6; };

/**
 * SESSİZ SAAT — Türkiye saatiyle 22:00-08:00 arası bildirim gönderilmez (sabit UTC+3).
 * `payDk`: taramanın kararı için erken pay. Tarama 21:50'de biter, bildirim adımı birkaç dakika
 * sonra koşar; karar 22:00'ı geçmesin diye tarama 22:00'dan `payDk` önce sessiz sayar.
 */
export const SESSIZ_BAS_SAAT = 22;
export const SESSIZ_SON_SAAT = 8;
export const SESSIZ_PAY_DK = 15;
export function sessizSaatMi(sn: number, payDk = 0): boolean {
  const dk = Math.floor((((sn + 3 * SAAT) % 86400) + 86400) % 86400 / 60);
  return dk >= SESSIZ_BAS_SAAT * 60 - payDk || dk < SESSIZ_SON_SAAT * 60;
}

/** O İstanbul gününün 08:00'ı (unix saniye). */
const sabahSekiz = (sn: number) => istGun(sn) * 86400 - 3 * SAAT + SESSIZ_SON_SAAT * SAAT;

/**
 * Günün ilk sabah koşusu mu: sessiz saat dışında, hafta içi ve bir önceki yayımlanmış tarama
 * bugünün 08:00'ından önce. Sabah brifingi bu koşunun sonunda gider; cron saatlerce gecikse de
 * brifing tarama ile aynı anda gelir. Sabah koşusu düşerse (yayın yok) sonraki koşu ilk sayılır.
 */
export function sabahIlkKosuMu(oncekiUretildi: number | null, simdi: number): boolean {
  if (sessizSaatMi(simdi, SESSIZ_PAY_DK) || haftaSonuMu(simdi)) return false;
  return oncekiUretildi === null || !Number.isFinite(oncekiUretildi) || oncekiUretildi < sabahSekiz(simdi);
}

/** Sessiz saatte birikip sabah gidecek bildirimler (docs/tarama/bekleyen.json). */
export interface BekleyenBildirim {
  surum: 1;
  eslesmeler: Eslesme[];
  ulasanlar: HedefUlasan[];
}

const eslesmeAnahtari = (e: Eslesme) => `${e.piyasa}:${e.sembol}:${e.taramaId}:${e.yon}`;
const ulasanAnahtari = (u: HedefUlasan) => `${u.piyasa}:${u.sembol}:${u.taramaId}:${u.t}`;
const tekil = <T>(liste: T[], anahtar: (x: T) => string) => {
  const gorulen = new Set<string>();
  return liste.filter((x) => { const k = anahtar(x); if (gorulen.has(k)) return false; gorulen.add(k); return true; });
};

/**
 * Bildirim kuyruğu. Sessiz saatte bu koşunun yeni eşleşmeleri ve hedefe ulaşanları kuyruğa
 * eklenir, hiçbir şey gönderilmez. Sessiz saat dışında kuyruktakiler bu koşununkilerle birlikte
 * gönderilir ve kuyruk boşalır. Gece görülen ama sabah artık uymayan eşleşme gönderilmez
 * (`guncel`: bu koşunun bütün eşleşmeleri); hedefe ulaşma olmuş bir olaydır, düşmez.
 */
export function kuyrukIlerlet(
  bekleyen: BekleyenBildirim | null,
  yeni: Eslesme[],
  ulasanlar: HedefUlasan[],
  guncel: Eslesme[],
  simdi: number,
): { sessiz: boolean; bekleyen: BekleyenBildirim | null; eslesmeler: Eslesme[]; ulasanlar: HedefUlasan[] } {
  const eskiE = bekleyen?.eslesmeler ?? [];
  const eskiU = bekleyen?.ulasanlar ?? [];
  if (sessizSaatMi(simdi, SESSIZ_PAY_DK)) {
    return {
      sessiz: true,
      bekleyen: { surum: 1, eslesmeler: tekil([...eskiE, ...yeni], eslesmeAnahtari), ulasanlar: tekil([...eskiU, ...ulasanlar], ulasanAnahtari) },
      eslesmeler: yeni,
      ulasanlar,
    };
  }
  const simdiUyan = new Set(guncel.map(eslesmeAnahtari));
  return {
    sessiz: false,
    bekleyen: null,
    eslesmeler: tekil([...eskiE.filter((e) => simdiUyan.has(eslesmeAnahtari(e))), ...yeni], eslesmeAnahtari),
    ulasanlar: tekil([...eskiU, ...ulasanlar], ulasanAnahtari),
  };
}
